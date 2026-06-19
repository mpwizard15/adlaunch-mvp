// The launch loop — the heart of the product (architecture doc §2).
// Builds the Meta campaign tree in PAUSED state, then activates as the final atomic step.
// Tracks created object IDs for idempotent retry and partial-failure rollback.

const { db } = require("./store");
const { metaClient } = require("./metaClient");
const { compileCreative } = require("./templates");

const STEPS = ["campaign", "adset", "creative", "ad", "activate"];

async function runLaunchJob(jobId) {
  const job = db.jobs.get(jobId);
  if (!job) throw new Error("job not found");
  if (job.state === "done") return job; // idempotent: already completed

  job.state = "running";
  job.attempts += 1;
  job.updatedAt = Date.now();

  const template = db.templates.get(job.templateId);
  const connection = db.connections.get(job.clientId);
  const token = process.env.META_ACCESS_TOKEN || "MOCK_TOKEN";
  const created = job.created; // persisted so a retry resumes instead of duplicating
  const ctx = {
    adAccountId: connection.adAccountId,
    pageId: connection.pageId,
  };

  try {
    const log = (s) => { job.progress = s; job.updatedAt = Date.now(); };

    if (!created.campaignId) {
      log("Creating campaign");
      created.campaignId = (await metaClient.createCampaign({
        adAccountId: ctx.adAccountId, name: `${template.name} — ${job.offer.city || "campaign"}`,
        objective: template.objective,
      }, token)).id;
    }

    if (!created.adSetId) {
      log("Creating ad set & targeting");
      const targeting = {
        geo_locations: { custom_locations: [{ radius: template.targeting.geoRadiusMiles, distance_unit: "mile" }] },
        age_min: template.targeting.ageMin,
        age_max: template.targeting.ageMax,
        publisher_platforms: ["facebook", "instagram"],
      };
      created.adSetId = (await metaClient.createAdSet({
        adAccountId: ctx.adAccountId, campaignId: created.campaignId,
        name: `${template.name} adset`, budgetCents: Math.round(job.budget * 100),
        targeting, pageId: ctx.pageId,
      }, token)).id;
    }

    if (!created.creativeId) {
      log("Building creative");
      const creative = compileCreative(template, job.offer);
      job.compiledCreative = creative;
      created.creativeId = (await metaClient.createCreative({
        adAccountId: ctx.adAccountId, pageId: ctx.pageId, creative,
      }, token)).id;
    }

    if (!created.adId) {
      log("Creating ad");
      created.adId = (await metaClient.createAd({
        adAccountId: ctx.adAccountId, adSetId: created.adSetId,
        creativeId: created.creativeId, name: `${template.name} ad`,
      }, token)).id;
    }

    log("Activating campaign");
    await metaClient.activate({
      adId: created.adId, adSetId: created.adSetId, campaignId: created.campaignId,
    }, token);

    job.state = "done";
    job.progress = "Live";
    job.updatedAt = Date.now();

    // Materialize the campaign record.
    const campaign = {
      id: job.campaignRecordId,
      clientId: job.clientId,
      templateId: job.templateId,
      metaCampaignId: created.campaignId,
      metaAdSetId: created.adSetId,
      metaAdId: created.adId,
      status: "ACTIVE",
      budget: job.budget,
      offer: job.offer,
    };
    db.campaigns.set(campaign.id, campaign);

    // In mock/demo mode, seed insights + a sample lead so reporting is populated
    // immediately. In live mode these arrive via insights sync + lead webhooks.
    if ((process.env.META_MODE || "mock") !== "live") {
      try {
        const { syncCampaignInsights } = require("./insights");
        const { ingestLead } = require("./leads");
        await syncCampaignInsights(campaign, "MOCK_TOKEN", 7);
        await ingestLead({
          clientId: job.clientId, campaignRecordId: campaign.id, source: "meta_demo",
          fields: { full_name: "Jordan Sample", email: "jordan@example.com", phone: "+1-555-0142",
                    interest: job.offer.offer || "general" },
        });
      } catch { /* non-fatal in demo */ }
    }
    return job;
  } catch (err) {
    job.error = err.message;
    job.metaCode = err.metaCode || null;
    job.updatedAt = Date.now();

    // Rollback partial tree so the client never sees orphaned objects.
    if (job.attempts >= job.maxAttempts) {
      job.state = "failed";
      job.progress = "Rolling back partial campaign";
      try {
        if (created.adId) await metaClient.deleteObject(created.adId, token);
        if (created.adSetId) await metaClient.deleteObject(created.adSetId, token);
        if (created.campaignId) await metaClient.deleteObject(created.campaignId, token);
      } catch { /* best-effort cleanup */ }
      job.progress = "Failed (rolled back)";
    } else {
      job.state = "retry"; // queue will re-run; created IDs make it resume safely
    }
    throw err;
  }
}

module.exports = { runLaunchJob, STEPS };

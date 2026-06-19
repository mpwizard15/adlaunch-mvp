// Isolated Meta Marketing API client (architecture doc §2/§3).
// Two modes:
//   mock  -> returns fake IDs so the full launch loop runs with no credentials.
//   live  -> calls the real Graph API via global fetch (Node 18+).
//
// All Meta access goes through this one module so API/version changes touch one file.

const MODE = process.env.META_MODE || "mock";
const VERSION = process.env.META_API_VERSION || "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

let mockSeq = 1000;
const nextId = (prefix) => `${prefix}_${MODE === "mock" ? ++mockSeq : Date.now()}`;

async function graph(path, params, token) {
  const url = `${BASE}/${path}`;
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(url, { method: "POST", body });
  const json = await res.json();
  if (!res.ok || json.error) {
    const e = json.error || {};
    const err = new Error(e.message || `Meta API error (${res.status})`);
    err.metaCode = e.code;
    err.metaSubcode = e.error_subcode;
    throw err;
  }
  return json;
}

// Each method mirrors one rung of the campaign tree.
const metaClient = {
  mode: MODE,

  async createCampaign({ adAccountId, name, objective }, token) {
    if (MODE === "mock") return { id: nextId("camp") };
    const r = await graph(`${adAccountId}/campaigns`, {
      name, objective, status: "PAUSED", special_ad_categories: "[]",
    }, token);
    return { id: r.id };
  },

  async createAdSet({ adAccountId, campaignId, name, budgetCents, targeting, pageId }, token) {
    if (MODE === "mock") return { id: nextId("adset") };
    const r = await graph(`${adAccountId}/adsets`, {
      name,
      campaign_id: campaignId,
      daily_budget: String(budgetCents),
      billing_event: "IMPRESSIONS",
      optimization_goal: "LEAD_GENERATION",
      status: "PAUSED",
      targeting: JSON.stringify(targeting),
      promoted_object: JSON.stringify({ page_id: pageId }),
    }, token);
    return { id: r.id };
  },

  async createCreative({ adAccountId, pageId, creative }, token) {
    if (MODE === "mock") return { id: nextId("creative") };
    const spec = {
      page_id: pageId,
      link_data: {
        message: creative.primaryText,
        name: creative.headline,
        description: creative.description,
        call_to_action: { type: creative.cta },
      },
    };
    const r = await graph(`${adAccountId}/adcreatives`, {
      name: creative.headline,
      object_story_spec: JSON.stringify(spec),
    }, token);
    return { id: r.id };
  },

  async createAd({ adAccountId, adSetId, creativeId, name }, token) {
    if (MODE === "mock") return { id: nextId("ad") };
    const r = await graph(`${adAccountId}/ads`, {
      name, adset_id: adSetId, creative: JSON.stringify({ creative_id: creativeId }), status: "PAUSED",
    }, token);
    return { id: r.id };
  },

  // Final step: flip the whole tree live. Nothing spends money until this succeeds.
  async activate({ adId, adSetId, campaignId }, token) {
    if (MODE === "mock") return { ok: true };
    await graph(adId, { status: "ACTIVE" }, token);
    await graph(adSetId, { status: "ACTIVE" }, token);
    await graph(campaignId, { status: "ACTIVE" }, token);
    return { ok: true };
  },

  // Rollback for partial failures (architecture doc §6).
  async deleteObject(id, token) {
    if (MODE === "mock") return { ok: true };
    try {
      const res = await fetch(`${BASE}/${id}?access_token=${encodeURIComponent(token)}`, { method: "DELETE" });
      return { ok: res.ok };
    } catch { return { ok: false }; }
  },
};

module.exports = { metaClient };

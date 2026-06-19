// Insights / reporting layer (architecture doc §6 "API versioning", §1 datastore).
// live: polls the Marketing API /insights edge and materializes daily rows.
// mock: synthesizes plausible daily numbers so the dashboard is populated.

const { db } = require("./store");

// Sync the last N days of insights for one campaign into insights_daily.
async function syncCampaignInsights(campaign, token, days = 7) {
  if (!campaign) return [];
  const rows = [];

  if (process.env.META_MODE === "live") {
    const VERSION = process.env.META_API_VERSION || "v21.0";
    const url = new URL(`https://graph.facebook.com/${VERSION}/${campaign.metaCampaignId}/insights`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("fields", "spend,impressions,actions");
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("date_preset", "last_7d");
    const res = await fetch(url);
    const json = await res.json();
    (json.data || []).forEach((d) => {
      const leadAction = (d.actions || []).find((a) => a.action_type === "lead");
      const leads = leadAction ? Number(leadAction.value) : 0;
      const spend = Number(d.spend || 0);
      rows.push({
        campaignId: campaign.id, date: d.date_start,
        spend, impressions: Number(d.impressions || 0),
        leads, cpl: leads ? +(spend / leads).toFixed(2) : 0,
      });
    });
  } else {
    // mock: deterministic-ish synthetic series based on the campaign budget.
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
      const spend = +(campaign.budget * (0.8 + Math.random() * 0.4)).toFixed(2);
      const impressions = Math.round(spend * (40 + Math.random() * 30));
      const leads = Math.max(0, Math.round(spend / (6 + Math.random() * 6)));
      rows.push({ campaignId: campaign.id, date, spend, impressions, leads, cpl: leads ? +(spend / leads).toFixed(2) : 0 });
    }
  }

  rows.forEach((r) => db.insights.set(`${r.campaignId}:${r.date}`, r));
  return rows;
}

// Roll up all of a client's campaigns into a summary + daily series.
function reportForClient(clientId) {
  const campaigns = [...db.campaigns.values()].filter((c) => c.clientId === clientId);
  const ids = new Set(campaigns.map((c) => c.id));
  const daily = [...db.insights.values()].filter((r) => ids.has(r.campaignId));
  const byDate = {};
  daily.forEach((r) => {
    byDate[r.date] = byDate[r.date] || { date: r.date, spend: 0, impressions: 0, leads: 0 };
    byDate[r.date].spend += r.spend;
    byDate[r.date].impressions += r.impressions;
    byDate[r.date].leads += r.leads;
  });
  const series = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, spend: +d.spend.toFixed(2), cpl: d.leads ? +(d.spend / d.leads).toFixed(2) : 0 }));
  const totals = series.reduce((t, d) => ({
    spend: +(t.spend + d.spend).toFixed(2), impressions: t.impressions + d.impressions, leads: t.leads + d.leads,
  }), { spend: 0, impressions: 0, leads: 0 });
  totals.cpl = totals.leads ? +(totals.spend / totals.leads).toFixed(2) : 0;
  totals.campaigns = campaigns.length;
  return { totals, series };
}

module.exports = { syncCampaignInsights, reportForClient };

// In-memory datastore. Swap for Postgres in production (see architecture doc §4).
// Tenant hierarchy: reseller -> client -> connection/campaign. Kept minimal for the MVP.

const { randomUUID } = require("crypto");

const db = {
  resellers: new Map(),
  clients: new Map(),
  connections: new Map(), // clientId -> meta connection (populated by OAuth)
  templates: new Map(),
  campaigns: new Map(),
  jobs: new Map(),
  leads: new Map(),
  insights: new Map(),    // `${campaignId}:${date}` -> daily row
};

function seed() {
  const resellerId = "res_demo";
  db.resellers.set(resellerId, {
    id: resellerId,
    name: "Demo Agency",
    plan: "growth",
    // White-label branding + the ad-spend markup this agency charges its clients.
    brand: { name: "Launchpad Ads", color: "#5B5BD6", markupPct: 15 },
  });

  // Agency-side roster: the businesses this reseller manages (UpHex's reseller view).
  db.agencyClients = [
    { id: "ac_sunrise", business: "Sunrise Realty", niche: "real_estate", plan: "$300/mo", spend: 2840, leads: 96, status: "active" },
    { id: "ac_glow", business: "Glow Med Spa", niche: "med_spa", plan: "$250/mo", spend: 1610, leads: 71, status: "active" },
    { id: "ac_bright", business: "Bright Smile Dental", niche: "dental", plan: "$400/mo", spend: 3920, leads: 58, status: "active" },
    { id: "ac_peak", business: "Peak Fitness", niche: "fitness", plan: "$200/mo", spend: 980, leads: 142, status: "active" },
    { id: "ac_harbor", business: "Harbor Realty Group", niche: "real_estate", plan: "$300/mo", spend: 0, leads: 0, status: "onboarding" },
  ];

  const clientId = "cli_demo";
  db.clients.set(clientId, {
    id: clientId,
    resellerId,
    businessName: "Sunrise Realty",
    niche: "real_estate",
    // Where this client's leads get forwarded (CRM webhook / GoHighLevel / Zapier).
    crmWebhook: process.env.CLIENT_CRM_WEBHOOK || "https://example-crm.test/webhook/sunrise",
  });

  // No Meta connection yet — the client establishes it via the OAuth "Connect Facebook"
  // flow. If env credentials are present (live), pre-populate so launches work immediately.
  if (process.env.META_AD_ACCOUNT_ID && process.env.META_PAGE_ID) {
    db.connections.set(clientId, {
      clientId,
      adAccountId: process.env.META_AD_ACCOUNT_ID,
      pageId: process.env.META_PAGE_ID,
      status: "connected",
    });
  }

  return { resellerId, clientId };
}

module.exports = { db, seed, randomUUID };

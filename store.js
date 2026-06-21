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
    brand: { name: "Launchpad Ads", color: "#5B5BD6" },
  });

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

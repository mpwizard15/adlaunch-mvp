// Leads layer (architecture doc §6 "Lead delivery").
// - Receives leads from Meta lead webhooks (live) or a simulator (mock/demo).
// - Always stores the lead first, then forwards to the client's CRM/webhook (incl. GoHighLevel).

const { db, randomUUID } = require("./store");

// Store a lead and forward it. Returns the stored record.
async function ingestLead({ clientId, campaignRecordId, fields, source = "meta" }) {
  const lead = {
    id: "lead_" + randomUUID().slice(0, 8),
    clientId,
    campaignId: campaignRecordId || null,
    fields,                 // { full_name, email, phone, ... }
    source,
    forwardedTo: null,
    createdAt: Date.now(),
  };
  db.leads.set(lead.id, lead);

  // Forward to the client's configured destination (CRM webhook / GHL / Zapier).
  const client = db.clients.get(clientId);
  const dest = client && client.crmWebhook;
  if (dest) {
    try {
      if (process.env.META_MODE === "live") {
        await fetch(dest, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead: fields, campaignId: lead.campaignId }),
        });
      }
      lead.forwardedTo = dest; // in mock we just record the intent
    } catch (e) {
      lead.forwardError = e.message;
    }
  }
  return lead;
}

// Pull leads from Meta's instant forms for a connected client (live).
// In mock mode the simulator feeds ingestLead() directly instead.
async function pullLeadsFromMeta(connection, token) {
  if (process.env.META_MODE !== "live") return [];
  const VERSION = process.env.META_API_VERSION || "v21.0";
  const url = new URL(`https://graph.facebook.com/${VERSION}/${connection.pageId}/leadgen_forms`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  const json = await res.json();
  return json.data || [];
}

function listLeads(clientId) {
  return [...db.leads.values()].filter((l) => l.clientId === clientId).sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = { ingestLead, pullLeadsFromMeta, listLeads };

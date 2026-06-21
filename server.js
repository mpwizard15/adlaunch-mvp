// Zero-dependency HTTP server (Node 18+). Application layer from architecture doc §1.
// Loads .env if present, seeds demo data, exposes the API, serves the client portal.

const http = require("http");
const fs = require("fs");
const path = require("path");

loadDotEnv();

const { db, seed, randomUUID } = require("./store");
const { seedTemplates } = require("./templates");
const { enqueue } = require("./queue");
const { metaClient } = require("./metaClient");
const oauth = require("./oauth");
const { ingestLead, listLeads } = require("./leads");
const { syncCampaignInsights, reportForClient } = require("./insights");

const oauthStates = new Map(); // state -> clientId (CSRF protection)

const { resellerId, clientId } = seed();
seedTemplates(resellerId);

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;

    if (p === "/api/health") return json(res, 200, { ok: true, metaMode: metaClient.mode });

    // Branding for the white-label portal (architecture doc §5).
    if (p === "/api/brand") {
      const r = db.resellers.get(resellerId);
      return json(res, 200, { name: r.brand.name, color: r.brand.color });
    }

    if (p === "/api/templates" && req.method === "GET") {
      return json(res, 200, [...db.templates.values()]);
    }

    if (p === "/api/connection" && req.method === "GET") {
      const c = db.connections.get(clientId);
      return json(res, 200, c || { status: "not_connected" });
    }

    // --- Facebook Login OAuth (architecture doc §3) ---
    // Step 1: start — browser is redirected to Meta's auth dialog (or, in mock, straight to callback).
    if (p === "/api/oauth/start" && req.method === "GET") {
      const state = randomUUID();
      oauthStates.set(state, clientId);
      const dest = oauth.authorizeUrl(req, state);
      res.writeHead(302, { Location: dest });
      return res.end();
    }
    // Step 2: callback — exchange code, discover accounts/pages, store a pending connection.
    if (p === "/api/oauth/callback" && req.method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !oauthStates.has(state)) { res.writeHead(400); return res.end("Invalid OAuth state"); }
      const cid = oauthStates.get(state); oauthStates.delete(state);
      const info = await oauth.exchangeAndDiscover(req, code);
      db.connections.set(cid, {
        clientId: cid, status: "selecting", fbUserId: info.fbUserId,
        accessTokenEnc: "[encrypted]",            // store encrypted in production
        tokenExpiresAt: info.expiresAt,
        adAccounts: info.adAccounts, pages: info.pages,
        adAccountId: null, pageId: null,
      });
      if (!process.env.META_ACCESS_TOKEN) process.env.META_ACCESS_TOKEN = info.accessToken;
      res.writeHead(302, { Location: "/?connected=1" });
      return res.end();
    }
    // Step 3: client picks which ad account + page to use.
    if (p === "/api/oauth/select" && req.method === "POST") {
      const { adAccountId, pageId } = await readBody(req);
      const c = db.connections.get(clientId);
      if (!c) return json(res, 400, { error: "no pending connection" });
      c.adAccountId = adAccountId; c.pageId = pageId; c.status = "connected";
      return json(res, 200, c);
    }

    // --- Leads (architecture doc §6) ---
    // Meta lead webhook receiver (verification handshake + lead notifications).
    if (p === "/api/webhooks/meta-leads") {
      if (req.method === "GET") { // Meta verification handshake
        if (url.searchParams.get("hub.verify_token") === (process.env.META_VERIFY_TOKEN || "demo_verify"))
          return text(res, 200, url.searchParams.get("hub.challenge") || "");
        return text(res, 403, "bad verify token");
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        // Production: look up the leadgen_id via Graph API to fetch field values.
        const fields = body.fields || { full_name: "Webhook Lead", email: "lead@example.com" };
        const lead = await ingestLead({ clientId, campaignRecordId: body.campaignId, fields, source: "webhook" });
        return json(res, 200, { received: true, leadId: lead.id });
      }
    }
    if (p === "/api/leads" && req.method === "GET") {
      return json(res, 200, listLeads(clientId));
    }

    // --- Reporting (architecture doc §6) ---
    if (p === "/api/report" && req.method === "GET") {
      return json(res, 200, reportForClient(clientId));
    }
    // Manually trigger an insights resync (a scheduled worker does this in production).
    if (p === "/api/report/sync" && req.method === "POST") {
      const token = process.env.META_ACCESS_TOKEN || "MOCK_TOKEN";
      const campaigns = [...db.campaigns.values()].filter((c) => c.clientId === clientId);
      for (const c of campaigns) await syncCampaignInsights(c, token, 7);
      return json(res, 200, reportForClient(clientId));
    }

    // List launched campaigns for the client (joined with template name + latest report).
    if (p === "/api/campaigns" && req.method === "GET") {
      const rows = [...db.campaigns.values()]
        .filter((c) => c.clientId === clientId)
        .map((c) => {
          const t = db.templates.get(c.templateId);
          const daily = [...db.insights.values()].filter((r) => r.campaignId === c.id);
          const spend = +daily.reduce((s, r) => s + r.spend, 0).toFixed(2);
          const leads = daily.reduce((s, r) => s + r.leads, 0);
          return {
            id: c.id, name: t ? t.name : "Campaign", niche: t ? t.niche : "",
            status: c.status, budget: c.budget, offer: c.offer,
            metaCampaignId: c.metaCampaignId, spend, leads,
            cpl: leads ? +(spend / leads).toFixed(2) : 0,
          };
        });
      return json(res, 200, rows);
    }

    // Kick off a launch -> 202 with a jobId (async, queued).
    if (p === "/api/launch" && req.method === "POST") {
      const body = await readBody(req);
      const { templateId, offer = {}, budget } = body;
      if (!db.templates.has(templateId)) return json(res, 400, { error: "unknown templateId" });
      if (!(budget > 0)) return json(res, 400, { error: "budget must be > 0" });

      const jobId = "job_" + randomUUID().slice(0, 8);
      db.jobs.set(jobId, {
        id: jobId,
        clientId,
        templateId,
        offer,
        budget,
        state: "queued",
        progress: "Queued",
        attempts: 0,
        maxAttempts: 3,
        created: {},                       // resume/idempotency state
        campaignRecordId: "camp_" + randomUUID().slice(0, 8),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      enqueue(jobId);
      return json(res, 202, { jobId });
    }

    // Poll job status (the browser polls this; production could use websockets).
    const jobMatch = p.match(/^\/api\/jobs\/([\w-]+)$/);
    if (jobMatch && req.method === "GET") {
      const job = db.jobs.get(jobMatch[1]);
      if (!job) return json(res, 404, { error: "job not found" });
      return json(res, 200, {
        id: job.id, state: job.state, progress: job.progress,
        attempts: job.attempts, error: job.error || null,
        created: job.created, compiledCreative: job.compiledCreative || null,
      });
    }

    // Static client portal.
    return serveStatic(p, res);
  } catch (err) {
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`AdLaunch MVP running  ->  http://localhost:${PORT}`);
  console.log(`Meta mode: ${metaClient.mode}  (set META_MODE=live in .env for real API calls)`);
});

// ---------- helpers ----------
function json(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(s) });
  res.end(s);
}
function text(res, code, str) {
  res.writeHead(code, { "Content-Type": "text/plain" });
  res.end(str);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}
function serveStatic(p, res) {
  const file = p === "/" ? "/index.html" : p;
  const full = path.join(__dirname, path.normalize(file).replace(/^(\.\.[/\\])+/, ""));
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(full);
    const type = ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : "text/plain";
    res.writeHead(200, { "Content-Type": type });
    res.end(buf);
  });
}
function loadDotEnv() {
  try {
    const txt = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    txt.split("\n").forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    });
  } catch { /* no .env; mock mode defaults apply */ }
}

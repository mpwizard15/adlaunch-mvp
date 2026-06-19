# AdLaunch — White-Label Meta Ads Platform (MVP skeleton)

A runnable starting point for an UpHex-style product: an agency builds reusable ad
**templates**, a client picks one, adds their offer + budget, and clicks **Launch** —
the app builds the full Meta campaign tree and activates it.

This skeleton has **zero dependencies** (Node 18+ only) and runs in **mock mode** out of
the box, so you can see the whole launch loop without any Meta credentials.

## Run it

```bash
cd uphex-mvp
node server.js
# open http://localhost:3000
```

Then, in the portal:
1. **Connect Facebook** (mock OAuth — no real login needed) and pick an ad account + Page.
2. **Launch** tab — pick a template, set an offer/budget, watch the campaign tree build
   (Campaign → Ad Set → Creative → Ad) and flip live.
3. **Dashboard** tab — spend / leads / CPL with a 7-day chart (auto-populated after launch).
4. **Leads** tab — leads from the campaign, plus a button to simulate an inbound lead webhook.

## Go live against the real Meta Marketing API

1. `cp .env.example .env`
2. Set `META_MODE=live` and fill in `META_APP_ID`, `META_APP_SECRET`, and a per-client
   `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID` (obtained via Facebook Login OAuth).
3. **You must have Advanced Access to `ads_management`** (Meta App Review + Business
   Verification) before you can manage clients' accounts. See the architecture doc §7.

> Mock vs live is a single switch in `src/metaClient.js` — the rest of the code is identical.

## What's here

```
server.js            HTTP server, routing, static portal, .env loader
public/index.html    Client portal: Connect, Launch, Dashboard, Leads tabs
src/store.js         In-memory datastore (swap for Postgres)
src/templates.js     Template model + token compilation ({{offer}} -> ad copy)
src/metaClient.js    Isolated Meta API client — mock + live modes
src/launchWorker.js  The launch loop: PAUSED tree -> activate, with rollback + idempotency
src/queue.js         In-process job queue with retry (swap for BullMQ/Redis)
src/oauth.js         Facebook Login flow: authorize URL, code->token, account/page discovery
src/leads.js         Lead ingest + CRM/GoHighLevel forwarding + webhook handling
src/insights.js      Insights sync (live: /insights edge; mock: synthetic) + client report
```

## API endpoints

```
GET  /api/health                 mode + status
GET  /api/brand                  white-label branding
GET  /api/templates              list ad templates
GET  /api/oauth/start            begin Facebook Login (302)
GET  /api/oauth/callback         token exchange + account/page discovery
POST /api/oauth/select           choose ad account + Page
GET  /api/connection             current Meta connection state
POST /api/launch                 enqueue a launch -> { jobId }
GET  /api/jobs/:id               launch job status (poll)
GET  /api/report                 spend / leads / CPL + 7-day series
POST /api/report/sync            resync insights
GET  /api/leads                  list leads
GET/POST /api/webhooks/meta-leads  Meta lead webhook (verify handshake + ingest)
```

## Mapped to the architecture doc

- **Launch loop & PAUSED→ACTIVE** — `launchWorker.js` (§2, §3)
- **Idempotency + partial-failure rollback** — `launchWorker.js` (§6)
- **Meta object tree** — `metaClient.js` (§3)
- **Multi-tenant data model** — `store.js` (§4)
- **White-label branding** — `/api/brand` + CSS variables (§5)

## What's intentionally stubbed (next steps)

- Postgres + Redis (here in-memory)
- Auth / sessions / roles + custom-domain tenant resolution
- Stripe billing & ad-spend markup
- Creative/image upload (live creative uses link_data text only)
- Token encryption with a real KMS (here a placeholder)
- Scheduled insights worker (here a manual /api/report/sync)

The OAuth flow, lead webhook + forwarding, and insights/reporting are now implemented
(mock + live paths). See `Meta_App_Review_Submission.docx` for getting the live
permissions approved.

This is a skeleton to build on, not production code — but the launch loop, the Meta
mapping, and the failure handling are real and structured the way the production system
should be.

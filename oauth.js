// Facebook Login OAuth flow (architecture doc §3 "Account connection").
// mock mode: simulates the whole handshake so you can click "Connect" with no app.
// live mode: real authorize URL + code->token exchange + long-lived token + account/page discovery.
//
// Scopes a reseller ad platform needs:
const SCOPES = [
  "ads_management",     // create/manage campaigns on the client's behalf (write)
  "ads_read",           // read performance/insights
  "business_management",// manage business assets
  "pages_show_list",    // list the pages the client can advertise for
  "leads_retrieval",    // pull leads from instant forms
  "pages_manage_ads",
];

const MODE = process.env.META_MODE || "mock";
const VERSION = process.env.META_API_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${VERSION}`;
const DIALOG = `https://www.facebook.com/${VERSION}/dialog/oauth`;

function redirectUri(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host;
  return `${proto}://${host}/api/oauth/callback`;
}

// Step 1 — build the URL we send the client's browser to.
function authorizeUrl(req, state) {
  if (MODE === "mock") {
    // In mock mode we bounce straight back to our own callback with a fake code.
    return `/api/oauth/callback?code=MOCK_CODE&state=${encodeURIComponent(state)}`;
  }
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID || "",
    redirect_uri: redirectUri(req),
    state,
    scope: SCOPES.join(","),
    response_type: "code",
  });
  return `${DIALOG}?${params}`;
}

// Step 2 — exchange the returned code for a long-lived user token,
// then discover the client's ad accounts and pages.
async function exchangeAndDiscover(req, code) {
  if (MODE === "mock") {
    return {
      accessToken: "MOCK_LONG_LIVED_TOKEN",
      expiresAt: Date.now() + 60 * 24 * 3600 * 1000, // ~60 days
      fbUserId: "mock_user_1",
      adAccounts: [
        { id: "act_1111111111", name: "Sunrise Realty Ad Account" },
        { id: "act_2222222222", name: "Sunrise Realty (secondary)" },
      ],
      pages: [
        { id: "100000000000001", name: "Sunrise Realty" },
        { id: "100000000000002", name: "Sunrise Realty — Listings" },
      ],
    };
  }

  // --- live ---
  const shortTok = await getJson(`${GRAPH}/oauth/access_token`, {
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: redirectUri(req),
    code,
  });
  const longTok = await getJson(`${GRAPH}/oauth/access_token`, {
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: shortTok.access_token,
  });
  const token = longTok.access_token;
  const me = await getJson(`${GRAPH}/me`, { access_token: token, fields: "id" });
  const accts = await getJson(`${GRAPH}/me/adaccounts`, { access_token: token, fields: "name" });
  const pages = await getJson(`${GRAPH}/me/accounts`, { access_token: token, fields: "name" });
  return {
    accessToken: token,
    expiresAt: Date.now() + (longTok.expires_in || 5184000) * 1000,
    fbUserId: me.id,
    adAccounts: (accts.data || []).map((a) => ({ id: a.id, name: a.name })),
    pages: (pages.data || []).map((p) => ({ id: p.id, name: p.name })),
  };
}

async function getJson(url, params) {
  const u = new URL(url);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error((json.error && json.error.message) || "OAuth error");
  return json;
}

module.exports = { SCOPES, authorizeUrl, exchangeAndDiscover, MODE };

// ============================================================================
// Grunion RFC dashboard — ads tracker (Google Ads, Google Ad Grants, Meta, our own forms)
// GET /.netlify/functions/ads-stats?days=30        (7 | 30 | 90 | all)   [&fresh=1]
// Requires header  x-dashboard-key: <DASHBOARD_KEY env var>
//
// Joins read-only sources by campaign name, so a new campaign on any platform
// shows up the day it spends. Nothing to register, nothing to type.
//   1. GA4 Data API (the dashboard's existing service account), two properties
//      - grunionrugby.com (GA_PROPERTY_ID): Google Ads cost / impressions /
//        clicks per campaign once a Google Ads account is linked to it (GA4
//        Admin → Product links → Google Ads links), plus sessions and the
//        lead_play / lead_coach / tap_text / tap_email events its landing
//        pages send, for every campaign on every platform.
//      - sbrfc.com (SBRFC_GA_PROPERTY_ID, default 557211956): the Google Ad
//        Grants account (922-418-2497) is linked to this one, so the grant
//        campaigns' cost / impressions / clicks come from here, with sessions
//        and the player_signup / sponsor_inquiry / coach_signup / contact_click
//        / youth_register_click / club_site_click events the sbrfc.com pages
//        send (thebigsur/sbrfc-website, site.js).
//      Google's cost lands in GA4 about a day late, so a brand-new Google
//      campaign shows visits before spend.
//   2. Meta Marketing API (Facebook + Instagram)
//      - every ad account assigned to the dashboard's system user (listed
//        from /me/adaccounts) plus any named in META_AD_ACCOUNT_ID. Each
//        account is read on its own, so one that fails never hides the rest.
//      - campaign list with status and start date, spend / impressions / link
//        clicks and Meta's own lead counts (Instant Forms, Pixel), split by
//        publisher platform (facebook / instagram / …).
//      - messages: Meta's "messaging conversations started" (a DM thread
//        opened from an ad after 7+ days of quiet) and "new messaging
//        contacts", per campaign / platform / day. Kept apart from leads, with
//        their own cost per message; campaigns whose ad sets send people to
//        Instagram Direct / Messenger / WhatsApp count as message campaigns
//        and their spend is left out of cost per lead.
//   3. Netlify Forms (the dashboard's existing token; both sites are in the
//      Grunion Rugby Netlify team)
//      - grunionrugby.com: play-signup + coach-application
//      - sbrfc.com: mens-, womens-, youth-, general-interest, sponsor-inquiry,
//        coach-signup
//      read with the hidden utm_* / gclid / fbclid / referrer fields the pages
//      stamp on them. These are the ground-truth leads.
//
// Ad Grants spend is Google's free grant credit, not cash. It is reported on
// its own (the "grant" block, the grant platform row and the grant campaign
// rows) and kept out of the spend, click, cost-per-lead and lead totals, which
// stay real money only.
//
// Env vars (Site configuration → Environment variables, scope: Functions):
//   DASHBOARD_KEY                        (required) shared dashboard passcode
//   GA_CLIENT_EMAIL + GA_PRIVATE_KEY     (or GA_SERVICE_ACCOUNT_JSON) — as ga-stats
//   GA_PROPERTY_ID                       numeric GA4 property id of grunionrugby.com
//   SBRFC_GA_PROPERTY_ID                 optional, default 557211956 (sbrfc.com);
//                                        "off" leaves sbrfc.com out
//   NETLIFY_API_TOKEN                    as netlify-stats (NETLIFY_SITE_ID, SITE_DOMAIN optional)
//   SBRFC_NETLIFY_SITE_ID                optional; found by matching sbrfc.com
//   META_ADS_TOKEN                       read-only system-user token with ads_read
//   META_AD_ACCOUNT_ID                   optional: extra ad account id(s), comma-
//                                        separated, with or without "act_". Accounts
//                                        assigned to the system user are found on their own.
//   META_API_VERSION                     optional, default v23.0
//   ADS_START_DATE                       optional, YYYY-MM-DD; the "since launch"
//                                        range starts here (default 2026-09-01)
//
// Zero npm dependencies (node built-ins only), read-only against every API,
// answers are cached in memory for 10 minutes so committee refreshes never
// touch Meta's development-tier rate limit (60 calls per 5 minutes; one
// report is 1 + 5 calls per ad account).
// ============================================================================

import { createSign, timingSafeEqual } from 'node:crypto';

const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GA_DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const NETLIFY_API = 'https://api.netlify.com/api/v1';
const META_GRAPH = 'https://graph.facebook.com';

const TZ = 'America/Los_Angeles';          // the club's day boundary
const DEFAULT_START = '2026-09-01';         // first day of the 2027 campaigns
const CACHE_TTL_MS = 10 * 60 * 1000;
const ACCOUNT_CACHE_MS = 30 * 60 * 1000;    // the list of Meta ad accounts is reused this long
const NEW_DAYS = 14;                        // "NEW" badge window
const ACTIVE_DAYS = 3;                      // Google: spent in the last N days = active
const NO_LEADS_FLOOR = 50;                  // $ spent with zero leads (or, for a message campaign, zero messages) → flag
const UNTAGGED_MIN_CLICKS = 10;             // Meta clicks before "untagged" is called
// Google Ad Grants rules (Ad Grants policy compliance guide): the account must
// keep a 5% click-through rate each calendar month (two months in a row below
// it can deactivate the grant) and report at least one conversion a month.
const GRANT_DAILY_CAP = 329;                // $10,000 a month is about $329 a day
const GRANT_CTR_TARGET = 5;                 // %, per calendar month
const GRANT_CTR_MIN_IMPRESSIONS = 500;      // too few impressions this month to call the CTR yet
// sbrfc.com events Google Ads imports as conversions (Goals → Conversions)
const GRANT_CONVERSION_EVENTS = ['player_signup', 'sponsor_inquiry', 'coach_signup', 'contact_click', 'youth_register_click'];
// Meta's action types for messages from click-to-message ads (Instagram Direct,
// Messenger, WhatsApp). "Started" is Meta's headline result for a messages goal.
const MSG_STARTED = ['onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d'];
const MSG_NEW_CONTACTS = ['onsite_conversion.messaging_first_reply', 'messaging_first_reply'];
// an ad set that sends people into a chat: optimisation goal or destination says so.
// Lead ads that collect the form inside Messenger / Instagram Direct
// (LEAD_FROM_MESSENGER, LEAD_FROM_IG_DIRECT, lead goals) are lead campaigns, not
// message campaigns: their results are Instant Form-style leads.
const MSG_GOALS = /^(CONVERSATIONS|REPLIES|MESSAGING_[A-Z_]+)$/;
const MSG_DESTINATIONS = /MESSENGER|INSTAGRAM_DIRECT|WHATSAPP|MESSAGING/;
const LEAD_GOALS = /LEAD/;
const LEAD_DESTINATIONS = /^LEAD_FROM_/;
// The ad-set statuses to ask for, so a paused or archived ad set still counts
// and a finished message campaign whose spend is still in range keeps its
// label. From Meta's own list (AdSet.EffectiveStatus in
// facebook-python-business-sdk) minus DELETED: this edge refuses deleted
// objects with "(100/1815001) Cannot Request for Deleted Objects" (seen live,
// 8 Oct 2026). The Marketing API reference also lists PENDING_REVIEW,
// DISAPPROVED, PREAPPROVED, PENDING_BILLING_INFO and ADSET_PAUSED, but those
// only exist for ads, and sending them makes Meta reject the whole call.
const ADSET_STATUSES = ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ARCHIVED', 'IN_PROCESS', 'WITH_ISSUES'];
function isChatAdset(s) {
  const goal = String(s?.optimization_goal || '').toUpperCase();
  const dest = String(s?.destination_type || '').toUpperCase();
  if (LEAD_GOALS.test(goal) || LEAD_DESTINATIONS.test(dest)) return false;
  return MSG_GOALS.test(goal) || MSG_DESTINATIONS.test(dest);
}
const META_SOURCES = new Set(['fb', 'ig', 'msg', 'an', 'facebook', 'instagram', 'meta', 'messenger', 'audience_network']);

// The two websites the ads send people to. Each has its own GA4 property and
// its own Netlify forms; `google` says what a Google Ads visit counts as there.
const SITES = {
  grunion: {
    key: 'grunion', label: 'grunionrugby.com',
    domain: () => (process.env.SITE_DOMAIN || 'grunionrugby.com').toLowerCase(),
    property: () => process.env.GA_PROPERTY_ID,
    siteId: () => process.env.NETLIFY_SITE_ID,
    strictDomain: false, // as before: falls back to a site named like "grunion"
    forms: { 'play-signup': 'play', 'coach-application': 'coach' },
    events: ['lead_play', 'lead_coach', 'tap_text', 'tap_email'],
    google: 'google',
  },
  sbrfc: {
    key: 'sbrfc', label: 'sbrfc.com',
    domain: () => 'sbrfc.com',
    property: () => process.env.SBRFC_GA_PROPERTY_ID || '557211956',
    siteId: () => process.env.SBRFC_NETLIFY_SITE_ID,
    strictDomain: true, // never read some other site's forms by mistake
    forms: {
      'mens-interest': 'play', 'womens-interest': 'play', 'youth-interest': 'play', 'general-interest': 'play',
      'sponsor-inquiry': 'sponsor', 'coach-signup': 'coach',
    },
    events: ['player_signup', 'sponsor_inquiry', 'coach_signup', 'contact_click', 'youth_register_click', 'club_site_click'],
    google: 'grant', // the Google Ads account linked to sbrfc.com is the Ad Grants account
  },
};
const isOff = (v) => /^(off|none|false|0)$/i.test(String(v || '').trim());

// ---------- shared plumbing (same shape as ga-stats / netlify-stats) --------
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function gate(req) {
  // read-only endpoint: anything but GET/HEAD is refused before the key is even looked at
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'method not allowed' }, 405);
  const expected = process.env.DASHBOARD_KEY;
  // a missing passcode fails closed; the env-var name stays in the function log, not the reply
  if (!expected) { console.error('DASHBOARD_KEY is not set on this site'); return json({ error: 'unauthorized' }, 401); }
  const got = req.headers.get('x-dashboard-key') || '';
  const a = Buffer.from(String(got));
  const b = Buffer.from(String(expected));
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return ok ? null : json({ error: 'unauthorized' }, 401);
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function googleToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: email, scope: GA_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const sig = b64url(signer.sign(privateKey));
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${sig}` });
  const r = await fetch(GOOGLE_TOKEN_URL, { method: 'POST', body });
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error(`Google token exchange failed: ${data.error_description || data.error || r.status}`);
  return data.access_token;
}

// ---------- small helpers ---------------------------------------------------
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round = (v, d = 2) => (v == null || !Number.isFinite(v)) ? null : Number(v.toFixed(d));
const safeDiv = (a, b) => (b > 0 ? a / b : null);
const pct = (a, b, d = 1) => (b > 0 ? round((a / b) * 100, d) : null); // 0 stays 0, "no basis" is null
const lower = (s) => String(s || '').trim().toLowerCase();
const hostOf = (url) => { try { return new URL(String(url)).hostname.toLowerCase(); } catch { return lower(url); } };
const sum = (arr, f) => (arr || []).reduce((a, x) => a + (f(x) || 0), 0);

// Dates are handled as YYYY-MM-DD strings in the club's timezone.
const ptDate = (d = new Date()) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400e3);
const gaDate = (s) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s); // 20260917 → 2026-09-17
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const monthStartOf = (iso) => `${iso.slice(0, 8)}01`;

// Which platform a visit came from, judged from what the ad platforms put in
// the URL (utm_source + utm_medium, gclid, fbclid) and, failing that, the
// referrer. A source alone is not enough: the club's own Instagram bio link or
// a newsletter can carry utm_source=instagram with utm_medium=social, and that
// is organic, not an ad. Paid means a paid medium (our ad templates always set
// utm_medium=paid_social / cpc) or a Google click id (gclid is only ever added
// by Google Ads). A Facebook/Instagram visit without paid tags is kept apart as
// "meta_untagged": it may be an untagged ad, or someone tapping the club's bio
// link, so it must not be counted as a paid lead or pollute cost per lead.
const PAID_MEDIUM = /^(paid[-_ ]?social|paid[-_ ]?search|paid[-_ ]?ads?|paid|cpc|ppc|cpm|display)$/;
const FB_SOURCES = new Set(['fb', 'facebook', 'facebook.com']);
const IG_SOURCES = new Set(['ig', 'instagram', 'instagram.com']);
function classifyPlatform({ utm_source, utm_medium, utm_campaign, gclid, gbraid, wbraid, fbclid, referrer }) {
  const s = lower(utm_source), m = lower(utm_medium);
  const paid = PAID_MEDIUM.test(m);
  if (gclid || gbraid || wbraid || (s === 'google' && paid)) return 'google';
  if (paid) {
    if (FB_SOURCES.has(s)) return 'facebook';
    if (IG_SOURCES.has(s)) return 'instagram';
    if (s === 'msg' || s === 'messenger') return 'messenger';
    if (s === 'an' || s === 'audience_network') return 'audience_network';
  }
  const host = hostOf(referrer);
  if (META_SOURCES.has(s) || fbclid || /(^|\.)(facebook|instagram)\.com$|^fb\.me$/.test(host)) return 'meta_untagged';
  if ((s === 'google' || /(^|\.)google\./.test(host)) && !utm_campaign) return 'google_organic';
  return s ? `other:${s}` : 'other';
}
const isMetaPlatform = (p) => ['facebook', 'instagram', 'messenger', 'audience_network'].includes(p);
const isPaidPlatform = (p) => p === 'google' || isMetaPlatform(p); // real money; 'grant' is not
// a Google Ads visit to sbrfc.com came from the Ad Grants account
const sitePlatform = (p, site) => (p === 'google' && SITES[site]?.google === 'grant' ? 'grant' : p);
const PLATFORM_LABEL = {
  google: 'Google Search', grant: 'Google Ad Grants', facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger',
  audience_network: 'Audience Network', meta_untagged: 'Facebook / Instagram (organic or untagged)',
  google_organic: 'Google (organic)', other: 'Not from an ad',
};
const platformLabel = (p) => PLATFORM_LABEL[p] || (String(p).startsWith('other:') ? `Other (${p.slice(6)})` : p);

// GA4 session source/medium → platform, for sessions and events
function gaPlatform(source, medium) {
  const s = lower(source), m = lower(medium);
  if (s === 'google' && PAID_MEDIUM.test(m)) return 'google';
  if (META_SOURCES.has(s)) return classifyPlatform({ utm_source: s, utm_medium: m }); // paid medium → platform, else meta_untagged
  if (/(^|\.)(facebook|instagram)\.com$|^fb\.me$/.test(s)) return 'meta_untagged';
  return null; // not ad traffic
}

const TEAM_LABEL = { mens: 'Men’s', womens: 'Women’s', youth: 'Youth' };
function formLabel(l) {
  if (l.form === 'sponsor') return 'Sponsor inquiry';
  if (l.form === 'coach') return l.site === 'sbrfc' ? 'Coach / ref / volunteer' : 'Coach application';
  return TEAM_LABEL[l.team] ? `${TEAM_LABEL[l.team]} sign-up` : 'Player sign-up';
}

// ============================================================================
// Source 1 — GA4 (one call per property)
// ============================================================================
function gaCreds() {
  let email = process.env.GA_CLIENT_EMAIL, pk = process.env.GA_PRIVATE_KEY;
  if ((!email || !pk) && process.env.GA_SERVICE_ACCOUNT_JSON) {
    try { const sa = JSON.parse(process.env.GA_SERVICE_ACCOUNT_JSON); email = email || sa.client_email; pk = pk || sa.private_key; } catch { /* handled below */ }
  }
  if (!email || !pk) return null;
  return { email, pk: pk.replace(/\\n/g, '\n') };
}

async function fetchGA(range, sinceAll, site, getToken) {
  const property = String(site.property() || '').trim();
  if (isOff(property)) return { configured: false, off: true, ok: false, error: `${site.label} is switched off` };
  const creds = gaCreds();
  if (!creds) return { configured: false, ok: false, error: 'GA service account not set (GA_CLIENT_EMAIL + GA_PRIVATE_KEY)' };
  if (!property) return { configured: false, ok: false, error: 'GA_PROPERTY_ID not set' };

  const token = await getToken(creds);
  const run = async (requests) => {
    const r = await fetch(`${GA_DATA_API}/properties/${property}:batchRunReports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requests }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || `GA Data API ${r.status}`);
    return data.reports || [];
  };
  const rows = (rep) => rep?.rows || [];
  const dim = (row, i) => row.dimensionValues?.[i]?.value ?? '';
  const met = (row, i) => num(row.metricValues?.[i]?.value);
  const current = [{ startDate: range.since, endDate: range.until }];
  const allTime = [{ startDate: sinceAll, endDate: range.until }];
  const eventFilter = { filter: { fieldName: 'eventName', inListFilter: { values: site.events } } };

  // Two separate batches so a problem with the Google Ads cost metrics (e.g. no
  // Google Ads link yet) can never take the sessions/leads reports down with it.
  const adsBatch = run([
    { // Google Ads campaigns in range — what Google charged, what it sent us
      dateRanges: current,
      dimensions: [{ name: 'sessionGoogleAdsCampaignName' }, { name: 'sessionGoogleAdsCampaignId' }, { name: 'sessionGoogleAdsCampaignType' }],
      metrics: [{ name: 'advertiserAdCost' }, { name: 'advertiserAdImpressions' }, { name: 'advertiserAdClicks' }, { name: 'sessions' }, { name: 'engagedSessions' }],
      limit: '200',
    },
    { // Google Ads by day since launch — first/last activity, daily chart, id→name map
      dateRanges: allTime,
      dimensions: [{ name: 'date' }, { name: 'sessionGoogleAdsCampaignName' }, { name: 'sessionGoogleAdsCampaignId' }],
      metrics: [{ name: 'advertiserAdCost' }, { name: 'advertiserAdClicks' }, { name: 'advertiserAdImpressions' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: '10000',
    },
  ]);
  const trafficRequests = [
    { // sessions by source / medium / campaign in range
      dateRanges: current,
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }],
      metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: '500',
    },
    { // the landing-page events by source / medium / campaign in range
      dateRanges: current,
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }, { name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: eventFilter,
      limit: '1000',
    },
  ];
  // Ad Grants: the same events for this calendar month, whatever range is
  // shown, for the "at least one conversion a month" rule
  if (site.google === 'grant') {
    trafficRequests.push({
      dateRanges: [{ startDate: monthStartOf(range.until), endDate: range.until }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: eventFilter,
      limit: '200',
    });
  }
  const trafficBatch = run(trafficRequests);

  const out = { configured: true, ok: true, error: null, adsError: null, property, site: site.key, googleCampaigns: [], googleDaily: [], traffic: [], events: [], monthEvents: [] };
  const [ads, traffic] = await Promise.allSettled([adsBatch, trafficBatch]);

  if (traffic.status === 'rejected') {
    out.ok = false; out.error = String(traffic.reason?.message || traffic.reason);
  } else {
    const [sess, ev, month] = traffic.value;
    out.traffic = rows(sess).map((r) => ({ site: site.key, source: dim(r, 0), medium: dim(r, 1), campaign: dim(r, 2), sessions: met(r, 0), engaged: met(r, 1) }));
    out.events = rows(ev).map((r) => ({ site: site.key, source: dim(r, 0), medium: dim(r, 1), campaign: dim(r, 2), event: dim(r, 3), count: met(r, 0) }));
    out.monthEvents = rows(month).map((r) => ({ site: site.key, source: dim(r, 0), medium: dim(r, 1), event: dim(r, 2), count: met(r, 0) }));
  }
  if (ads.status === 'rejected') {
    out.adsError = String(ads.reason?.message || ads.reason);
  } else {
    const [camp, daily] = ads.value;
    const skip = (name) => !name || name === '(not set)' || name === '(other)';
    out.googleCampaigns = rows(camp).filter((r) => !skip(dim(r, 0))).map((r) => ({
      name: dim(r, 0), id: dim(r, 1), type: dim(r, 2),
      cost: met(r, 0), impressions: met(r, 1), clicks: met(r, 2), sessions: met(r, 3), engaged: met(r, 4),
    }));
    out.googleDaily = rows(daily).filter((r) => !skip(dim(r, 1))).map((r) => ({
      date: gaDate(dim(r, 0)), name: dim(r, 1), id: dim(r, 2), cost: met(r, 0), clicks: met(r, 1), impressions: met(r, 2),
    }));
  }
  return out;
}

// ============================================================================
// Source 2 — Meta Marketing API (every ad account the dashboard can read)
// ============================================================================
const actId = (s) => { const d = String(s || '').trim().replace(/^act_/i, ''); return /^\d+$/.test(d) ? `act_${d}` : null; };
const bareId = (s) => String(s || '').replace(/^act_/, '');
function metaError(e = {}, status) {
  // Meta's own words for what went wrong, so the dashboard shows the reason
  // instead of a bare "Invalid parameter"
  const detail = [e.error_user_title, e.error_user_msg].filter(Boolean).join(': ');
  return `Meta API ${e.code ? `(${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''}) ` : ''}${e.message || status}${detail ? ` (${detail})` : ''}`;
}
async function metaGet(url) {
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(metaError(data.error, r.status));
  return data;
}

// The ad accounts to read: every account assigned to the token's system user
// (Business settings → System users → grunion-dashboard → Assign assets), plus
// any extra ids in META_AD_ACCOUNT_ID. Assigning an account in Business
// settings (and, while the app is in Development mode, adding it under App
// settings → Advanced → Authorized ad account IDs) is all it takes to add one.
let accountCache = null; // { at, found }
async function metaAccounts(token, ver, fresh) {
  const listed = String(process.env.META_AD_ACCOUNT_ID || '').split(/[\s,;]+/).map(actId).filter(Boolean);
  let found = null, foundError = null;
  if (!fresh && accountCache && Date.now() - accountCache.at < ACCOUNT_CACHE_MS) found = accountCache.found;
  else {
    for (const edge of ['adaccounts', 'assigned_ad_accounts']) {
      try {
        const u = new URL(`${META_GRAPH}/${ver}/me/${edge}`);
        u.searchParams.set('fields', 'account_id,name,account_status');
        u.searchParams.set('limit', '50');
        u.searchParams.set('access_token', token);
        const data = await metaGet(u.toString());
        found = (data.data || [])
          .filter((a) => Number(a.account_status) !== 101) // 101 = closed
          .map((a) => ({ id: actId(a.account_id || a.id), name: a.name || null }))
          .filter((a) => a.id);
        foundError = null;
        accountCache = { at: Date.now(), found };
        break;
      } catch (e) { foundError = String(e.message || e); }
    }
  }
  const names = new Map((found || []).map((a) => [a.id, a.name]));
  const ids = [...new Set([...(found || []).map((a) => a.id), ...listed])];
  return { accounts: ids.map((id) => ({ id, name: names.get(id) || null })), foundError, listed };
}

async function fetchMetaAccount(account, token, ver, range, sinceAll) {
  const base = `${META_GRAPH}/${ver}/${account}`;
  const call = async (path, params, pages = 8) => {
    const url = new URL(`${base}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    url.searchParams.set('access_token', token);
    const all = [];
    let next = url.toString();
    for (let i = 0; i < pages && next; i++) {
      const data = await metaGet(next);
      all.push(...(data.data || []));
      next = data.paging?.next || null;
    }
    return all;
  };
  const timeRange = (since) => ({ since, until: range.until });
  const insightFields = 'campaign_id,campaign_name,spend,impressions,reach,clicks,inline_link_clicks,actions';

  // The ad-set list only answers "does this campaign send people into a chat?".
  // It is allowed to fail on its own: the rest of the Meta figures still report,
  // and campaigns are then judged by objective + messages alone (see isMsgId).
  let adsetsError = null;
  const [camps, ins, split, daily, adsets] = await Promise.all([
    call('campaigns', { fields: 'id,name,status,effective_status,objective,created_time,start_time,stop_time,daily_budget,lifetime_budget', limit: '200' }),
    call('insights', { level: 'campaign', fields: insightFields, time_range: timeRange(range.since), limit: '200' }),
    call('insights', { level: 'campaign', fields: insightFields, breakdowns: 'publisher_platform', time_range: timeRange(range.since), limit: '500' }),
    call('insights', { level: 'campaign', fields: 'campaign_id,campaign_name,spend,inline_link_clicks,impressions,actions', time_increment: '1', time_range: timeRange(sinceAll), limit: '500' }),
    call('adsets', { fields: 'campaign_id,optimization_goal,destination_type', effective_status: ADSET_STATUSES, limit: '200' }, 3)
      .then((rows) => (Array.isArray(rows) ? rows : Promise.reject(new Error('unexpected ad-set list'))))
      .catch((e) => { adsetsError = String(e.message || e); return null; }),
  ]);
  const chatCampaignIds = [];
  for (const s of adsets || []) if (isChatAdset(s)) chatCampaignIds.push(String(s.campaign_id));
  return { camps, ins, split, daily, adsetsError, chatCampaignIds };
}

async function fetchMeta(range, sinceAll, fresh) {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return { configured: false, ok: false, error: 'META_ADS_TOKEN not set' };
  const ver = process.env.META_API_VERSION || 'v23.0';
  const { accounts, foundError, listed } = await metaAccounts(token, ver, fresh);
  if (!accounts.length) {
    if (!foundError && !listed.length) return { configured: false, ok: false, error: 'no ad account is assigned to the dashboard yet' };
    return { configured: true, ok: false, error: `could not find an ad account to read: ${foundError}`, accounts: [], discoverError: foundError };
  }

  const results = await Promise.all(accounts.map((a) =>
    fetchMetaAccount(a.id, token, ver, range, sinceAll)
      .then((r) => ({ ...a, ok: true, ...r }), (e) => ({ ...a, ok: false, error: String(e.message || e) }))));
  // an Instagram-created account is named after its own id; don't say it twice
  const label = (r) => (r.name && r.name !== bareId(r.id) ? `${r.name} (${bareId(r.id)})` : bareId(r.id));
  const accountsOut = results.map((r) => ({
    id: bareId(r.id), name: r.name, label: label(r), ok: r.ok, error: r.error || null,
    adsetsError: r.adsetsError || null, campaigns: r.ok ? r.camps.length : null,
  }));
  const good = results.filter((r) => r.ok);
  if (!good.length) {
    return { configured: true, ok: false, error: results.map((r) => `${label(r)}: ${r.error}`).join(' · '), accounts: accountsOut, discoverError: foundError };
  }

  const actionsOf = (row) => {
    const map = {};
    for (const a of row.actions || []) map[a.action_type] = num(a.value);
    return map;
  };
  const firstOf = (a, keys) => { for (const k of keys) if (a[k] != null) return a[k]; return 0; };
  const messageCounts = (row) => {
    const a = actionsOf(row);
    return { started: firstOf(a, MSG_STARTED), newContacts: firstOf(a, MSG_NEW_CONTACTS) };
  };
  const leadCounts = (row) => {
    const a = actionsOf(row);
    const instant = a['onsite_conversion.lead_grouped'] ?? a['leadgen_grouped'] ?? a['leadgen.other'] ?? 0;
    const pixel = a['offsite_conversion.fb_pixel_lead'] ?? 0;
    const total = a['lead'] ?? (instant + pixel);
    return { instant, pixel, total: Math.max(total, instant + pixel) };
  };
  const norm = (row) => ({
    id: row.campaign_id, name: row.campaign_name,
    spend: num(row.spend), impressions: num(row.impressions), reach: num(row.reach),
    clicks: num(row.inline_link_clicks), allClicks: num(row.clicks),
    leads: leadCounts(row), messages: messageCounts(row),
  });
  return {
    configured: true, ok: true, error: null, accounts: accountsOut, discoverError: foundError,
    adsetsFailed: good.filter((r) => r.adsetsError).map((r) => bareId(r.id)),
    chatCampaignIds: [...new Set(good.flatMap((r) => r.chatCampaignIds))],
    campaigns: good.flatMap((r) => r.camps.map((c) => ({
      id: c.id, name: c.name, status: c.status, effectiveStatus: c.effective_status, objective: c.objective,
      accountId: bareId(r.id), accountLabel: label(r),
      created: c.created_time ? ptDate(new Date(c.created_time)) : null,
      start: c.start_time ? ptDate(new Date(c.start_time)) : null,
      stop: c.stop_time ? ptDate(new Date(c.stop_time)) : null,
      dailyBudget: c.daily_budget != null ? num(c.daily_budget) / 100 : null,
      lifetimeBudget: c.lifetime_budget != null ? num(c.lifetime_budget) / 100 : null,
    }))),
    insights: good.flatMap((r) => r.ins.map(norm)),
    split: good.flatMap((r) => r.split.map((row) => ({ ...norm(row), platform: lower(row.publisher_platform) || 'unknown' }))),
    daily: good.flatMap((r) => r.daily.map((row) => ({ ...norm(row), date: row.date_start }))),
  };
}

// ============================================================================
// Source 3 — Netlify Forms (our own leads, one call per site)
// ============================================================================
function netlifyClient(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const getJ = async (url) => {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Netlify API ${r.status} on ${url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')}`);
    return r.json();
  };
  let sitesP = null; // both sites are looked up in one list
  const sites = () => (sitesP ||= getJ(`${NETLIFY_API}/sites?filter=all&per_page=100`));
  return { getJ, sites };
}

async function fetchNetlify(range, site, client) {
  if (!client) return { configured: false, ok: false, error: 'NETLIFY_API_TOKEN not set' };
  const { getJ } = client;

  // resolve the site (same logic as netlify-stats; sbrfc.com must match exactly)
  const wantDomain = site.domain();
  let found = null;
  if (site.siteId()) found = await getJ(`${NETLIFY_API}/sites/${site.siteId()}`).catch(() => null);
  if (!found) {
    const sites = await client.sites();
    const matches = (s, d) =>
      [s.custom_domain, s.default_domain, ...(s.domain_aliases || [])].filter(Boolean)
        .some((x) => String(x).toLowerCase() === d || String(x).toLowerCase().endsWith(`.${d}`)) ||
      String(s.url || '').toLowerCase().includes(d);
    found = sites.find((s) => matches(s, wantDomain));
    if (!found && !site.strictDomain) found = sites.find((s) => String(s.name || '').toLowerCase().includes('grunion')) || sites[0];
    if (!found) {
      if (!sites.length) throw new Error('No sites visible to this token');
      return { configured: false, ok: false, error: `${site.label} is not one of the Netlify sites the dashboard's token can see` };
    }
  }
  const siteId = found.id || found.site_id;

  const forms = (await getJ(`${NETLIFY_API}/sites/${siteId}/forms`)).filter((f) => site.forms[f.name]);
  const listAll = async (formId, extra = '') => {
    const out = [];
    for (let page = 1; page <= 5; page++) {
      const batch = await getJ(`${NETLIFY_API}/forms/${formId}/submissions?per_page=100&page=${page}${extra}`);
      if (!Array.isArray(batch) || !batch.length) break;
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  };

  const leads = [];
  let spamCount = 0, spamSupported = null;
  for (const f of forms) {
    const kind = site.forms[f.name];
    const verified = await listAll(f.id);
    const ids = new Set(verified.map((s) => s.id));
    for (const s of verified) {
      const d = s.data || {};
      const at = s.created_at || '';
      const day = at ? ptDate(new Date(at)) : null;
      const fields = {
        utm_source: d.utm_source, utm_medium: d.utm_medium, utm_campaign: d.utm_campaign, utm_content: d.utm_content, utm_term: d.utm_term,
        gclid: d.gclid, gbraid: d.gbraid, wbraid: d.wbraid, fbclid: d.fbclid, referrer: d.referrer, landing: d.landing || d.landing_page,
      };
      const name = String(d.name || s.name || '').trim();
      const business = String(d.business || '').trim();
      leads.push({
        id: s.id, at, day, site: site.key, form: kind,
        team: kind === 'play' ? (lower(d.team) || null) : null,
        name: business ? `${name} (${business})` : name,
        platform: sitePlatform(classifyPlatform(fields), site.key),
        campaign: String(d.utm_campaign || '').trim(),
        ad: String(d.utm_content || '').trim(),
        term: String(d.utm_term || '').trim(),
        tagged: !!(d.utm_campaign || d.gclid || d.gbraid || d.wbraid || d.fbclid),
      });
    }
    // The spam folder: Netlify's published API spec has no state filter, so we
    // try it and only trust the answer if it returns rows that are NOT in the
    // verified list (an ignored parameter would echo the verified list back).
    try {
      const spam = await listAll(f.id, '&state=spam');
      const onlySpam = spam.filter((s) => !ids.has(s.id));
      if (spam.length && !onlySpam.length) spamSupported = spamSupported ?? false;
      else {
        spamSupported = true;
        spamCount += onlySpam.filter((s) => { const day = s.created_at ? ptDate(new Date(s.created_at)) : ''; return day >= range.since && day <= range.until; }).length;
      }
    } catch { spamSupported = spamSupported ?? false; }
  }
  leads.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { configured: true, ok: true, error: null, siteId, forms: forms.map((f) => ({ id: f.id, name: f.name, total: f.submission_count ?? null })), leads, spamCount, spamSupported };
}

// ============================================================================
// Put it together
// ============================================================================
function assemble({ ga, gaS, meta, nl, nlS, range, today, sinceAll, days }) {
  const inRange = (day) => day && day >= range.since && day <= range.until;
  const warnings = [];
  const campaigns = [];

  // ---- what the two GA4 properties saw (each row carries its site) ----------
  const gaTraffic = [...(ga.traffic || []), ...(gaS.traffic || [])];
  const gaEvents = [...(ga.events || []), ...(gaS.events || [])];
  const platOf = (t) => sitePlatform(gaPlatform(t.source, t.medium), t.site);
  const sessionsFor = (pred) => {
    let sessions = 0, engaged = 0;
    for (const t of gaTraffic) if (pred(t)) { sessions += t.sessions; engaged += t.engaged; }
    return { sessions, engaged };
  };
  const eventsFor = (pred) => {
    const out = {};
    for (const e of gaEvents) if (pred(e)) out[e.event] = (out[e.event] || 0) + e.count;
    return out;
  };
  const n0 = (o, k) => o?.[k] || 0;
  // text / email taps (grunionrugby.com) and call / text / email taps (sbrfc.com's contact_click)
  const tapsOf = (ev) => ({ text: n0(ev, 'tap_text'), email: n0(ev, 'tap_email'), contact: n0(ev, 'contact_click') });
  const tapCount = (t) => (t?.text || 0) + (t?.email || 0) + (t?.contact || 0);
  // sbrfc.com clicks on to the youth registration site and the three club sites
  const outOf = (ev) => ({ register: n0(ev, 'youth_register_click'), club: n0(ev, 'club_site_click') });
  const gaSignupsOf = (ev) => {
    const g = { play: n0(ev, 'lead_play') + n0(ev, 'player_signup'), coach: n0(ev, 'lead_coach') + n0(ev, 'coach_signup'), sponsor: n0(ev, 'sponsor_inquiry') };
    return { ...g, total: g.play + g.coach + g.sponsor };
  };
  // Ad Grants sign-ups: a form names its ad only when the visitor's browser
  // kept the ad's tags (scripts and storage allowed), and Analytics misses
  // people who block it. Both undercount, so each kind takes the higher count.
  const bestOf = (forms, gaSign) => {
    const out = { play: 0, coach: 0, sponsor: 0, total: 0 };
    let fromGa = false;
    for (const k of ['play', 'coach', 'sponsor']) {
      out[k] = Math.max(forms[k] || 0, gaSign[k] || 0);
      if ((gaSign[k] || 0) > (forms[k] || 0)) fromGa = true;
      out.total += out[k];
    }
    return { leads: out, source: fromGa ? 'ga' : 'forms' };
  };

  // ---- our own form leads, both sites ---------------------------------------
  const siteLeads = [...(nl.leads || []), ...(nlS.leads || [])].sort((a, b) => (a.at < b.at ? 1 : -1));
  const leadsIn = siteLeads.filter((l) => inRange(l.day));
  const leadsFor = (pred, list = leadsIn) => {
    const out = { play: 0, coach: 0, sponsor: 0, total: 0 };
    for (const l of list) if (pred(l)) { out[l.form] = (out[l.form] || 0) + 1; out.total += 1; }
    return out;
  };

  // ---- Google campaigns, one GA4 property at a time --------------------------
  // grunionrugby.com → paid Google Search; sbrfc.com → the Ad Grants account
  const gById = new Map(); // campaign id → name (form leads carry the id)
  const googleCampaigns = (gx, siteKey) => {
    const platform = SITES[siteKey].google;
    const gAll = new Map(); // name → {first,last,id}
    for (const d of (gx.googleDaily || [])) {
      const active = d.cost > 0 || d.impressions > 0 || d.clicks > 0;
      if (!active) continue;
      const g = gAll.get(d.name) || { name: d.name, id: d.id, first: d.date, last: d.date };
      if (d.date < g.first) g.first = d.date;
      if (d.date > g.last) g.last = d.date;
      gAll.set(d.name, g);
    }
    for (const c of (gx.googleCampaigns || [])) if (!gAll.has(c.name)) gAll.set(c.name, { name: c.name, id: c.id, first: null, last: null });
    for (const g of gAll.values()) if (g.id) gById.set(String(g.id), g.name);

    for (const g of gAll.values()) {
      const cur = (gx.googleCampaigns || []).find((c) => c.name === g.name) || { cost: 0, impressions: 0, clicks: 0, sessions: 0, engaged: 0, type: '' };
      const inRangeDays = (gx.googleDaily || []).filter((d) => d.name === g.name && inRange(d.date) && (d.cost > 0 || d.impressions > 0));
      if (!inRangeDays.length && !(cur.cost > 0 || cur.impressions > 0) && days !== 'all') continue; // nothing in this window
      const fromThis = (t) => t.site === siteKey && platOf(t) === platform && t.campaign === g.name;
      const sess = sessionsFor(fromThis);
      const ev = eventsFor(fromThis);
      const forms = leadsFor((l) => l.platform === platform && (l.campaign === String(g.id) || l.campaign === g.name));
      const gaSign = gaSignupsOf(ev);
      // Ad Grants: a form names its campaign only when the ad link carries
      // utm_campaign, while Analytics knows the campaign of every ad visit, so
      // per campaign the forms and Analytics' sign-up events are combined
      // (bestOf). Paid Google Search keeps counting forms only, as before.
      const best = platform === 'grant' ? bestOf(forms, gaSign) : { leads: forms, source: 'forms' };
      const lastActive = g.last;
      const status = !lastActive ? 'No spend yet' : daysBetween(lastActive, today) <= ACTIVE_DAYS ? 'Active' : 'Inactive';
      campaigns.push(row({
        key: `${platform}:${g.name}`, platform, platformLabel: PLATFORM_LABEL[platform], site: siteKey, name: g.name, id: g.id || null,
        kind: cur.type || null, status, statusRaw: null, firstSeen: g.first, lastSeen: lastActive,
        spend: cur.cost, impressions: cur.impressions, reach: null, clicks: cur.clicks, allClicks: cur.clicks,
        sessions: cur.sessions || sess.sessions, engaged: cur.engaged || sess.engaged,
        siteLeads: best.leads, leadSource: best.source,
        instantLeads: 0, pixelLeads: 0, taps: tapsOf(ev), clicksOut: outOf(ev),
        gaLeads: gaSign, split: null, dailyBudget: null,
      }, today));
    }
    return gAll;
  };
  const gAllG = googleCampaigns(ga, 'grunion');
  const gAllS = googleCampaigns(gaS, 'sbrfc');

  // Google traffic arriving with no cost data → the Google Ads ↔ GA4 link is missing
  const googleSessions = sessionsFor((t) => t.site === 'grunion' && platOf(t) === 'google').sessions;
  if (ga.ok && !ga.adsError && !gAllG.size && googleSessions > 0) {
    warnings.push({ level: 'warn', text: `GA4 sees ${googleSessions} Google Ads visits but no Google Ads cost data. Link the Google Ads account to GA4 (Admin → Product links → Google Ads links), or the ads only started today (cost lands in GA4 a day late).` });
  }
  if (ga.adsError) warnings.push({ level: 'warn', text: `Google Ads figures unavailable from GA4: ${ga.adsError}` });

  // ---- which Meta campaigns are message campaigns ---------------------------
  // A message campaign sends people into a chat (Instagram Direct, Messenger,
  // WhatsApp): one of its ad sets says so, or its objective is the old MESSAGES
  // one. Only if its account's ad-set list could not be read does an
  // Engagement campaign that has produced messages since launch count as one
  // too. Its spend is judged by cost per message and left out of cost per lead.
  // Decided by campaign id, because two boosts of the same post share a name.
  const metaIns = meta.ok ? (meta.insights || []) : [];
  const msgIds = new Set(meta.ok ? (meta.chatCampaignIds || []).map(String) : []);
  const adsetsFailed = new Set(meta.ok ? (meta.adsetsFailed || []).map(String) : []);
  if (meta.ok) {
    const msgSinceLaunch = new Map();
    for (const d of (meta.daily || [])) msgSinceLaunch.set(String(d.id), (msgSinceLaunch.get(String(d.id)) || 0) + (d.messages?.started || 0));
    for (const c of (meta.campaigns || [])) {
      const obj = String(c.objective || '').toUpperCase();
      if (obj === 'MESSAGES' || (adsetsFailed.has(String(c.accountId)) && /ENGAGEMENT/.test(obj) && (msgSinceLaunch.get(String(c.id)) || 0) > 0)) msgIds.add(String(c.id));
    }
  }
  const isMsgId = (id) => id != null && msgIds.has(String(id));
  // names are only needed to match our own form leads, which carry utm_campaign = the campaign name
  const msgNames = new Set([...(meta.ok ? meta.campaigns || [] : []), ...metaIns].filter((c) => isMsgId(c.id)).map((c) => c.name));
  if (meta.ok) {
    const accts = meta.accounts || [];
    for (const a of accts.filter((x) => !x.ok)) warnings.push({ level: 'warn', text: `Meta ad account ${a.label} could not be read, so its campaigns are missing below: ${a.error}` });
    const failedSets = accts.filter((x) => x.ok && x.adsetsError);
    if (failedSets.length) warnings.push({ level: 'info', text: `Meta's ad-set list could not be read for ${failedSets.map((x) => `${x.label} (${x.adsetsError})`).join('; ')}, so message campaigns there are recognised by their objective and messages only.` });
    if (meta.discoverError) warnings.push({ level: 'info', text: `Meta would not list the ad accounts assigned to the dashboard (${meta.discoverError}), so it read only the account(s) in META_AD_ACCOUNT_ID.` });
  }

  // ---- Meta campaigns -------------------------------------------------------
  if (meta.ok) {
    // Meta's own rows are joined by campaign id (two boosts of one post share a
    // name); only our visits and form leads are matched by name, via utm_campaign.
    const keyOf = (x) => (x.id != null && x.id !== '' ? `id:${x.id}` : `name:${x.name}`);
    const insByKey = new Map((meta.insights || []).map((i) => [keyOf(i), i]));
    const dailyByKey = new Map();
    for (const d of (meta.daily || [])) {
      const arr = dailyByKey.get(keyOf(d)) || [];
      arr.push(d); dailyByKey.set(keyOf(d), arr);
    }
    const splitByKey = new Map();
    for (const s of (meta.split || [])) {
      const m = splitByKey.get(keyOf(s)) || {};
      m[s.platform] = s; splitByKey.set(keyOf(s), m);
    }
    const seen = new Set();
    const metaList = (meta.campaigns || []).slice();
    const listed = new Set(metaList.map(keyOf));
    for (const i of (meta.insights || [])) if (!listed.has(keyOf(i))) { metaList.push({ id: i.id, name: i.name, effectiveStatus: null }); listed.add(keyOf(i)); }
    for (const c of metaList) {
      const k = keyOf(c);
      if (seen.has(k)) continue; seen.add(k);
      const st = String(c.effectiveStatus || c.status || '').toUpperCase();
      if (st === 'ARCHIVED' || st === 'DELETED') continue;
      const ins = insByKey.get(k) || { spend: 0, impressions: 0, reach: 0, clicks: 0, allClicks: 0, leads: { instant: 0, pixel: 0, total: 0 }, messages: { started: 0, newContacts: 0 } };
      const messaging = isMsgId(c.id);
      const dl = (dailyByKey.get(k) || []).filter((d) => d.spend > 0 || d.impressions > 0);
      const first = dl.length ? dl.reduce((m, d) => (d.date < m ? d.date : m), dl[0].date) : (c.start || c.created || null);
      const last = dl.length ? dl.reduce((m, d) => (d.date > m ? d.date : m), dl[0].date) : null;
      const recentlyMade = !!(c.created && daysBetween(c.created, today) <= 30);
      const live = ['ACTIVE', 'IN_PROCESS', 'PENDING_REVIEW', 'WITH_ISSUES', 'PREAPPROVED'].includes(st);
      const ranInRange = ins.spend > 0 || ins.impressions > 0;
      // Show it if it ran in this window, is live or about to be, was made in the
      // last 30 days, or (since-launch view) ever ran. Old drafts stay hidden.
      if (!ranInRange && !live && !recentlyMade && !(days === 'all' && dl.length)) continue;
      // a Meta ad may send people to either site, so both sites' visits count
      const fromThis = (t) => isMetaPlatform(platOf(t) || '') && t.campaign === c.name;
      const sess = sessionsFor(fromThis);
      const ev = eventsFor(fromThis);
      const leads = leadsFor((l) => isMetaPlatform(l.platform) && l.campaign === c.name);
      const sp = splitByKey.get(k) || {};
      const status = c.stop && c.stop < today && st !== 'ACTIVE' ? 'Ended'
        : ({ ACTIVE: 'Active', PAUSED: 'Paused', CAMPAIGN_PAUSED: 'Paused', ADSET_PAUSED: 'Paused (ad set)', IN_PROCESS: 'Starting', PENDING_REVIEW: 'In review', WITH_ISSUES: 'Has issues', DISAPPROVED: 'Disapproved', PREAPPROVED: 'Approved' }[st] || (st ? st.toLowerCase() : 'Unknown'));
      const flags = [];
      // "untagged" is about website-bound ads; a message ad has no site visit to tag
      if (!messaging && ins.clicks >= UNTAGGED_MIN_CLICKS && sess.sessions === 0 && ins.leads.instant === 0) flags.push('untagged');
      campaigns.push(row({
        key: `meta:${c.id || c.name}`, platform: 'meta', platformLabel: 'Facebook / Instagram', name: c.name, id: c.id || null,
        accountId: c.accountId || null, accountLabel: c.accountLabel || null,
        kind: c.objective ? String(c.objective).replace(/^OUTCOME_/, '').toLowerCase() : null, status, statusRaw: st || null,
        firstSeen: first, lastSeen: last,
        spend: ins.spend, impressions: ins.impressions, reach: ins.reach || null, clicks: ins.clicks, allClicks: ins.allClicks,
        sessions: sess.sessions, engaged: sess.engaged,
        siteLeads: leads, instantLeads: ins.leads.instant, pixelLeads: ins.leads.pixel, taps: tapsOf(ev), clicksOut: outOf(ev),
        gaLeads: gaSignupsOf(ev),
        messages: ins.messages.started, newContacts: ins.messages.newContacts, messaging,
        split: Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, { spend: round(v.spend), impressions: v.impressions, clicks: v.clicks, instantLeads: v.leads.instant, messages: v.messages.started }])),
        dailyBudget: c.dailyBudget ?? null, lifetimeBudget: c.lifetimeBudget ?? null, extraFlags: flags,
      }, today));
    }
  }

  // ---- platform roll-ups ----------------------------------------------------
  const platforms = [];
  const rowsOf = (p) => campaigns.filter((c) => c.platform === p);
  const gRows = rowsOf('google');
  const gSum = (k) => sum(gRows, (c) => c[k]);
  platforms.push(platformRow('google', 'Google Search', {
    spend: gSum('spend'), impressions: gSum('impressions'), clicks: gSum('clicks'),
    sessions: gSum('sessions'), engaged: gSum('engaged'),
    siteLeads: leadsFor((l) => l.platform === 'google').total, instantLeads: 0,
    taps: sum(gRows, (c) => tapCount(c.taps)),
    messages: null, messageSpend: 0, messagesFromMsgCampaigns: 0, msgLeads: 0, // Meta messages only
  }));
  // Google Ad Grants (sbrfc.com): free grant credit, listed beside the paid
  // platforms for comparison, never added into the money totals
  const grRows = rowsOf('grant');
  const grSum = (k) => sum(grRows, (c) => c[k]);
  const grantOn = gaS.configured !== false;
  const grantLeads = leadsFor((l) => l.platform === 'grant');
  const grantEv = eventsFor((t) => t.site === 'sbrfc' && platOf(t) === 'grant');
  const gaGrant = gaSignupsOf(grantEv);
  const grantBest = bestOf(grantLeads, gaGrant); // forms vs Analytics, per kind of sign-up
  if (grantOn || grRows.length || grantLeads.total) {
    platforms.push(platformRow('grant', 'Google Ad Grants (sbrfc.com)', {
      spend: grSum('spend'), impressions: grSum('impressions'), clicks: grSum('clicks'),
      sessions: grSum('sessions'), engaged: grSum('engaged'),
      siteLeads: grantBest.leads.total, instantLeads: 0,
      taps: sum(grRows, (c) => tapCount(c.taps)),
      messages: null, messageSpend: 0, messagesFromMsgCampaigns: 0, msgLeads: 0,
    }));
  }
  const msgByPlatform = {}; // platform → messages started (every Meta campaign)
  if (meta.ok) {
    const byPlat = {};
    const blank = () => ({ spend: 0, impressions: 0, clicks: 0, instantLeads: 0, messages: 0, messageSpend: 0, messagesFromMsgCampaigns: 0, msgInstantLeads: 0 });
    for (const s of (meta.split || [])) {
      const p = byPlat[s.platform] || (byPlat[s.platform] = blank());
      p.spend += s.spend; p.impressions += s.impressions; p.clicks += s.clicks; p.instantLeads += s.leads.instant;
      p.messages += s.messages.started;
      if (isMsgId(s.id)) { p.messageSpend += s.spend; p.messagesFromMsgCampaigns += s.messages.started; p.msgInstantLeads += s.leads.instant; }
      if (s.messages.started) msgByPlatform[s.platform] = (msgByPlatform[s.platform] || 0) + s.messages.started;
    }
    const order = ['facebook', 'instagram', 'messenger', 'audience_network', 'unknown'];
    const keys = Object.keys(byPlat).sort((a, b) => (order.indexOf(a) + 100) % 100 - (order.indexOf(b) + 100) % 100);
    for (const k of ['facebook', 'instagram']) if (!keys.includes(k)) keys.push(k);
    for (const k of keys) {
      const p = byPlat[k] || blank();
      const plat = k === 'audience_network' ? 'audience_network' : k;
      const sess = sessionsFor((t) => platOf(t) === plat);
      const ev = eventsFor((e) => platOf(e) === plat);
      platforms.push(platformRow(plat, platformLabel(plat), {
        spend: p.spend, impressions: p.impressions, clicks: p.clicks, sessions: sess.sessions, engaged: sess.engaged,
        siteLeads: leadsFor((l) => l.platform === plat).total, instantLeads: p.instantLeads, taps: tapCount(tapsOf(ev)),
        messages: p.messages, messageSpend: p.messageSpend, messagesFromMsgCampaigns: p.messagesFromMsgCampaigns,
        // leads that message campaigns brought in leave cost per lead along with their spend
        msgLeads: p.msgInstantLeads + leadsFor((l) => l.platform === plat && msgNames.has(l.campaign)).total,
      }));
    }
  }
  // Facebook/Instagram visits that carried no campaign tags: an untagged ad or
  // the club's own bio link. Listed so the totals reconcile, never as paid leads.
  {
    const sess = sessionsFor((t) => platOf(t) === 'meta_untagged');
    const ev = eventsFor((e) => platOf(e) === 'meta_untagged');
    const untagged = leadsFor((l) => l.platform === 'meta_untagged').total;
    // spend / impressions / clicks are null here on purpose: "not applicable", not zero
    if (untagged || sess.sessions) platforms.push(platformRow('meta_untagged', 'Facebook / Instagram, not paid', { spend: null, impressions: null, clicks: null, sessions: sess.sessions, engaged: sess.engaged, siteLeads: untagged, instantLeads: 0, taps: tapCount(tapsOf(ev)), messages: null }));
  }
  const notFromAds = (l) => !isPaidPlatform(l.platform) && l.platform !== 'grant' && l.platform !== 'meta_untagged';
  const other = leadsFor(notFromAds);
  if (other.total) platforms.push(platformRow('other', 'Not from an ad (direct, organic, other)', { spend: null, impressions: null, clicks: null, sessions: null, engaged: null, siteLeads: other.total, instantLeads: 0, taps: null, messages: null }));

  // ---- totals (real money: paid Google Search + Meta; Ad Grants are below) ----
  const paidRows = campaigns.filter((c) => c.platform !== 'grant');
  const googleSpend = gSum('spend');
  const metaSpend = meta.ok ? sum(meta.insights || [], (i) => i.spend) : 0;
  const spend = googleSpend + metaSpend;
  const clicks = gSum('clicks') + (meta.ok ? sum(meta.insights || [], (i) => i.clicks) : 0);
  const impressions = gSum('impressions') + (meta.ok ? sum(meta.insights || [], (i) => i.impressions) : 0);
  const instantLeads = meta.ok ? sum(meta.insights || [], (i) => i.leads.instant) : 0;
  const pixelLeads = meta.ok ? sum(meta.insights || [], (i) => i.leads.pixel) : 0;
  const adLeads = leadsFor((l) => isPaidPlatform(l.platform));
  const untaggedSocialLeads = leadsFor((l) => l.platform === 'meta_untagged');
  const allSiteLeads = leadsFor(() => true);
  const tapsAds = sum(paidRows, (c) => tapCount(c.taps));
  const tapsAll = tapCount(tapsOf(eventsFor(() => true)));
  const leads = adLeads.total + instantLeads;
  // messages: every Meta campaign's count is shown; cost per message divides the
  // spend of message campaigns by the messages those campaigns brought in
  const messages = sum(metaIns, (i) => i.messages?.started);
  const newContacts = sum(metaIns, (i) => i.messages?.newContacts);
  const msgIns = metaIns.filter((i) => isMsgId(i.id));
  const messageSpend = sum(msgIns, (i) => i.spend);
  const messagesFromMsgCampaigns = sum(msgIns, (i) => i.messages?.started);
  // cost per lead = what lead campaigns spent ÷ the leads they brought in; any
  // lead a message campaign happened to bring in leaves with its spend
  const leadSpend = Math.max(0, spend - messageSpend);
  const leadsFromMsgCampaigns = sum(msgIns, (i) => i.leads.instant) + leadsFor((l) => isMetaPlatform(l.platform) && msgNames.has(l.campaign)).total;
  const cplLeads = Math.max(0, leads - leadsFromMsgCampaigns);
  const msgCamps = campaigns.filter((c) => c.messaging);
  const totals = {
    spend: round(spend), googleSpend: round(googleSpend), metaSpend: round(metaSpend), grantSpend: round(grSum('spend')),
    impressions, clicks, cpc: round(safeDiv(spend, clicks)),
    leads, siteLeadsFromAds: adLeads, siteLeadsUntaggedSocial: untaggedSocialLeads, siteLeadsFromGrants: grantLeads,
    siteLeadsOther: other, siteLeadsAll: allSiteLeads, instantLeads, pixelLeads,
    leadSpend: round(leadSpend), cplLeads, leadsFromMsgCampaigns, cpl: round(safeDiv(leadSpend, cplLeads)), clickToLead: pct(leads, clicks),
    taps: tapsAds, tapsAllVisitors: tapsAll,
    sessions: sum(paidRows, (c) => c.sessions),
    messages, newContacts, messagesByPlatform: msgByPlatform, messagesFromMsgCampaigns,
    messageSpend: round(messageSpend), costPerMessage: round(safeDiv(messageSpend, messagesFromMsgCampaigns)),
    messageCampaigns: msgCamps.length, messageCampaignsActive: msgCamps.filter((c) => c.status === 'Active').length,
  };

  // ---- Google Ad Grants (sbrfc.com) -----------------------------------------
  const monthStart = monthStartOf(today);
  const gDaily = gaS.googleDaily || [];
  const shown = gDaily.filter((d) => d.impressions > 0).map((d) => d.date).sort();
  const mtd = gDaily.filter((d) => d.date >= monthStart && d.date <= today);
  const mtdImpressions = sum(mtd, (d) => d.impressions), mtdClicks = sum(mtd, (d) => d.clicks);
  // Google counts the conversions it imports from sbrfc.com's Analytics
  const mtdConversions = sum((gaS.monthEvents || []).filter((e) => platOf(e) === 'grant' && GRANT_CONVERSION_EVENTS.includes(e.event)), (e) => e.count);
  const mtdSignups = leadsFor((l) => l.platform === 'grant' && l.day >= monthStart && l.day <= today, siteLeads);
  // average per day over the days in range that the grant ads were running
  // (from the first to the last day with impressions; today's cost lands tomorrow)
  const runFrom = shown.length ? (shown[0] > range.since ? shown[0] : range.since) : null;
  const runTo = shown.length ? (shown[shown.length - 1] < range.until ? shown[shown.length - 1] : range.until) : null;
  const runDays = runFrom && runTo && runTo >= runFrom ? daysBetween(runFrom, runTo) + 1 : null;
  const grSpend = grSum('spend'), grClicks = grSum('clicks'), grImpressions = grSum('impressions');
  const untaggedGrant = leadsFor((l) => l.platform === 'grant' && !l.campaign).total;
  const grant = {
    configured: grantOn, ok: !!gaS.ok, error: gaS.error || null, adsError: gaS.adsError || null, property: gaS.property || null,
    formsOk: !!nlS.ok, formsError: nlS.error || null,
    spend: round(grSpend), impressions: grImpressions, clicks: grClicks, ctr: pct(grClicks, grImpressions, 2), cpc: round(safeDiv(grSpend, grClicks)),
    sessions: grSum('sessions'), engaged: grSum('engaged'), engagementRate: pct(grSum('engaged'), grSum('sessions')),
    avgDailySpend: runDays ? round(grSpend / runDays) : null, runDays, dailyCap: GRANT_DAILY_CAP, ctrTarget: GRANT_CTR_TARGET,
    signups: grantLeads, gaSignups: gaGrant, best: grantBest.leads, leads: grantBest.leads.total, leadSource: grantBest.source,
    cpl: round(safeDiv(grSpend, grantBest.leads.total)),
    signupsAll: leadsFor((l) => l.site === 'sbrfc'),
    taps: tapCount(tapsOf(grantEv)), registerClicks: n0(grantEv, 'youth_register_click'), clubClicks: n0(grantEv, 'club_site_click'),
    firstShown: shown[0] || null, lastShown: shown[shown.length - 1] || null,
    month: {
      start: monthStart, spend: round(sum(mtd, (d) => d.cost)), impressions: mtdImpressions, clicks: mtdClicks,
      ctr: pct(mtdClicks, mtdImpressions, 2), conversions: mtdConversions, signups: mtdSignups.total,
    },
    campaigns: grRows.length, campaignsActive: grRows.filter((c) => c.status === 'Active').length,
    untaggedSignups: untaggedGrant,
  };
  if (grantOn) {
    if (gaS.configured && !gaS.ok) warnings.push({ level: 'warn', text: `sbrfc.com Google Analytics error: ${gaS.error}` });
    if (gaS.adsError && gaS.adsError !== gaS.error) warnings.push({ level: 'warn', text: `Ad Grants figures unavailable from sbrfc.com's Google Analytics: ${gaS.adsError}` });
    const grantSessions = sessionsFor((t) => t.site === 'sbrfc' && platOf(t) === 'grant').sessions;
    if (gaS.ok && !gaS.adsError && !gAllS.size && grantSessions > 0) {
      warnings.push({ level: 'warn', text: `sbrfc.com's Google Analytics sees ${grantSessions} Google Ads visits but no Ad Grants cost data. Check the Google Ads link on the sbrfc.com property (Admin → Product links → Google Ads links), or the ads only started today (cost lands a day late).` });
    }
    if (gaS.ok && !gaS.adsError && !shown.length && !grantSessions) {
      const since = new Date(`${sinceAll}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      warnings.push({ level: 'info', text: `No Google Ad Grants ad has shown yet: Google reports no impressions since ${since}. Its figures reach Analytics about a day late; if this stays, check the campaign statuses in Google Ads.` });
    }
    if (mtdImpressions >= GRANT_CTR_MIN_IMPRESSIONS && grant.month.ctr != null && grant.month.ctr < GRANT_CTR_TARGET) {
      warnings.push({ level: 'warn', text: `Ad Grants click-through rate this month is ${grant.month.ctr}%. Google expects 5% or more every month and can pause the grant after two months in a row below it.` });
    }
    // (a problem both sites share, like a missing token, is reported once below)
    if (nlS.error !== nl.error) {
      if (nlS.configured === false) warnings.push({ level: 'warn', text: `sbrfc.com sign-up forms are not connected: ${nlS.error}` });
      else if (!nlS.ok) warnings.push({ level: 'warn', text: `sbrfc.com forms (Netlify) error: ${nlS.error}` });
    }
    if (untaggedGrant > 0) warnings.push({ level: 'info', text: `${untaggedGrant} sbrfc.com sign-up${untaggedGrant === 1 ? '' : 's'} in this range came from a Google ad whose link names no campaign, so ${untaggedGrant === 1 ? 'it counts' : 'they count'} toward Ad Grants as a whole and Analytics matches them to campaigns. Adding the Final URL suffix in Google Ads (DASHBOARD-SETUP.md, 6f) names the campaign on every form.` });
  }

  // ---- flags + warnings -----------------------------------------------------
  for (const c of campaigns) {
    // a message campaign is judged on messages, everything else on leads
    if (c.messaging) { if (c.spend >= NO_LEADS_FLOOR && c.messages === 0 && c.leads === 0) c.flags.push('no_messages'); }
    else if (c.spend >= NO_LEADS_FLOOR && c.leads === 0) c.flags.push('no_leads');
    if (c.isNew) c.flags.push('new');
  }
  campaigns.sort((a, b) => (b.spend - a.spend) || (b.lastSeen || '').localeCompare(a.lastSeen || ''));
  const untaggedCamps = campaigns.filter((c) => c.flags.includes('untagged'));
  if (untaggedCamps.length) warnings.push({ level: 'warn', text: `${untaggedCamps.map((c) => `"${c.name}"`).join(', ')}: Meta reports clicks but no tagged visits reached the site. Add the URL parameters line to that campaign's ads (DASHBOARD-SETUP.md) unless it uses Instant Forms.` });
  for (const [n, label] of [[nl, 'grunionrugby.com'], [nlS, 'sbrfc.com']]) {
    if (n.ok && n.spamSupported && n.spamCount > 0) warnings.push({ level: 'warn', text: `${n.spamCount} ${label} form submission${n.spamCount === 1 ? ' in this range sits' : 's in this range sit'} in Netlify's spam folder. Check Forms → Spam submissions; real ones can be marked verified.` });
  }
  if (meta.configured === false) warnings.push({ level: 'info', text: 'Meta is not connected yet: add META_ADS_TOKEN in Netlify env vars and assign the ad account to the grunion-dashboard system user, then redeploy. Facebook and Instagram figures appear after that.' });
  else if (!meta.ok) warnings.push({ level: 'warn', text: `Meta error: ${meta.error}` });
  if (ga.configured === false) warnings.push({ level: 'warn', text: `Google Analytics is not connected: ${ga.error}` });
  else if (!ga.ok) warnings.push({ level: 'warn', text: `Google Analytics error: ${ga.error}` });
  if (nl.configured === false) warnings.push({ level: 'warn', text: `Netlify is not connected: ${nl.error}` });
  else if (!nl.ok) warnings.push({ level: 'warn', text: `Netlify error: ${nl.error}` });
  const grunionIn = leadsIn.filter((l) => l.site === 'grunion');
  const untaggedLeads = grunionIn.filter((l) => !l.tagged).length;
  // only meaningful while website-bound ads run (a message ad never tags a visit)
  if (grunionIn.length && untaggedLeads === grunionIn.length && leadSpend > 0) warnings.push({ level: 'info', text: 'None of the recent site leads carried campaign tags. If the landing-page change has not been deployed yet, that is expected.' });

  // ---- daily series (in range) ------------------------------------------------
  const daily = [];
  for (let d = range.since; d <= range.until; d = addDays(d, 1)) {
    const gD = (ga.googleDaily || []).filter((x) => x.date === d);
    const sD = gDaily.filter((x) => x.date === d);
    const mD = (meta.daily || []).filter((x) => x.date === d);
    daily.push({
      date: d,
      googleSpend: round(sum(gD, (x) => x.cost)),
      metaSpend: round(sum(mD, (x) => x.spend)),
      grantSpend: round(sum(sD, (x) => x.cost)),
      grantClicks: sum(sD, (x) => x.clicks),
      siteLeads: leadsIn.filter((l) => l.site === 'grunion' && l.day === d).length,
      sbrfcLeads: leadsIn.filter((l) => l.site === 'sbrfc' && l.day === d).length,
      instantLeads: sum(mD, (x) => x.leads.instant),
      messages: sum(mD, (x) => x.messages?.started),
    });
  }

  const recentLeads = siteLeads.slice(0, 25).map((l) => ({
    at: l.at, form: l.form, formLabel: formLabel(l), site: l.site, siteLabel: SITES[l.site]?.label || l.site, team: l.team,
    name: l.name, platform: l.platform, platformLabel: platformLabel(l.platform),
    campaign: (l.platform === 'google' || l.platform === 'grant') ? (gById.get(l.campaign) || l.campaign) : l.campaign, ad: l.ad, term: l.term, tagged: l.tagged,
  }));

  return { totals, grant, platforms, campaigns, daily, recentLeads, warnings };
}

function row(c, today) {
  const leads = c.siteLeads.total + c.instantLeads;
  const messages = c.messages || 0;
  const goal = /sponsor/i.test(c.name) ? 'Sponsors'
    : /coach|referee|\brefs?\b|volunteer/i.test(c.name) ? 'Coach'
      : (c.siteLeads.sponsor > Math.max(c.siteLeads.play, c.siteLeads.coach) ? 'Sponsors'
        : c.siteLeads.coach > c.siteLeads.play ? 'Coach' : 'Players');
  return {
    key: c.key, platform: c.platform, platformLabel: c.platformLabel, site: c.site || null, accountId: c.accountId || null, accountLabel: c.accountLabel || null,
    name: c.name, id: c.id, kind: c.kind, goal,
    status: c.status, statusRaw: c.statusRaw, firstSeen: c.firstSeen, lastSeen: c.lastSeen,
    daysRunning: c.firstSeen ? Math.max(1, daysBetween(c.firstSeen, today) + 1) : null,
    isNew: !!(c.firstSeen && daysBetween(c.firstSeen, today) < NEW_DAYS),
    spend: round(c.spend), impressions: c.impressions, reach: c.reach, clicks: c.clicks, allClicks: c.allClicks,
    ctr: pct(c.clicks, c.impressions, 2), cpc: round(safeDiv(c.spend, c.clicks)),
    sessions: c.sessions, engaged: c.engaged, engagementRate: pct(c.engaged, c.sessions),
    siteLeads: c.siteLeads, leadSource: c.leadSource || 'forms', instantLeads: c.instantLeads, pixelLeads: c.pixelLeads, gaLeads: c.gaLeads, leads,
    cpl: c.messaging ? null : round(safeDiv(c.spend, leads)), clickToLead: pct(leads, c.clicks),
    messaging: !!c.messaging, messages, newContacts: c.newContacts || 0,
    costPerMessage: c.messaging ? round(safeDiv(c.spend, messages)) : null,
    taps: c.taps, clicksOut: c.clicksOut || { register: 0, club: 0 },
    split: c.split, dailyBudget: c.dailyBudget, lifetimeBudget: c.lifetimeBudget ?? null, flags: (c.extraFlags || []).slice(),
  };
}
const PLATFORM_NOTES = {
  grant: 'Free Google search ads from the Ad Grants account, landing on sbrfc.com. The spend is grant credit, not cash, so it stays out of the spend, click and cost-per-lead tiles. Site leads are sbrfc.com sign-ups that came from these ads.',
  meta_untagged: 'Visits and leads from Facebook or Instagram that carried no paid-ad tags: the club\'s own posts and bio link, a share, or an ad whose URL parameters are missing. Never counted as paid leads.',
  other: 'Site leads whose visit carried no ad tags at all: direct, organic search, word of mouth.',
};
function platformRow(key, label, p) {
  const leads = p.siteLeads + p.instantLeads;
  const na = p.spend == null; // rows with no ad spend behind them: nothing to divide by
  const messageSpend = na ? null : (p.messageSpend || 0);
  return {
    key, label, note: PLATFORM_NOTES[key] || null, spend: round(p.spend), impressions: p.impressions, clicks: p.clicks,
    ctr: na ? null : pct(p.clicks, p.impressions, 2), cpc: na ? null : round(safeDiv(p.spend, p.clicks)),
    sessions: p.sessions, engaged: p.engaged, engagementRate: p.sessions == null ? null : pct(p.engaged, p.sessions),
    siteLeads: p.siteLeads, instantLeads: p.instantLeads, leads,
    // spend on message campaigns (and any lead they brought in) is judged by
    // cost per message, not cost per lead
    cpl: na ? null : round(safeDiv(Math.max(0, p.spend - messageSpend), Math.max(0, leads - (p.msgLeads || 0)))), clickToLead: na ? null : pct(leads, p.clicks), taps: p.taps,
    messages: p.messages ?? null, messageSpend: round(messageSpend), messagesFromMsgCampaigns: na ? null : (p.messagesFromMsgCampaigns || 0), msgLeads: na ? null : (p.msgLeads || 0),
    costPerMessage: na ? null : round(safeDiv(messageSpend, p.messagesFromMsgCampaigns || 0)),
  };
}

// ============================================================================
// Handler
// ============================================================================
const cache = new Map(); // days → { at, body }

async function buildReport({ daysParam, fresh }) {
  const today = ptDate();
  const sinceAll = validDate(process.env.ADS_START_DATE) ? process.env.ADS_START_DATE : DEFAULT_START;
  const days = daysParam === 'all' ? 'all' : ([7, 30, 90].includes(Number(daysParam)) ? Number(daysParam) : 30);
  const range = { since: days === 'all' ? sinceAll : addDays(today, -(days - 1)), until: today };
  if (range.since > today) range.since = today;

  const settle = (p) => p.then((v) => v).catch((e) => ({ configured: true, ok: false, error: String(e.message || e) }));
  let tokenP = null; // one Google token serves both properties
  const getToken = (c) => (tokenP ||= googleToken(c.email, c.pk));
  const client = process.env.NETLIFY_API_TOKEN ? netlifyClient(process.env.NETLIFY_API_TOKEN) : null;
  // SBRFC_GA_PROPERTY_ID=off leaves sbrfc.com out altogether (its Analytics and its forms)
  const sbrfcOff = isOff(SITES.sbrfc.property());
  const offSite = { configured: false, off: true, ok: false, error: 'sbrfc.com is switched off (SBRFC_GA_PROPERTY_ID=off)' };
  const [ga, gaS, meta, nl, nlS] = await Promise.all([
    settle(fetchGA(range, sinceAll, SITES.grunion, getToken)),
    sbrfcOff ? offSite : settle(fetchGA(range, sinceAll, SITES.sbrfc, getToken)),
    settle(fetchMeta(range, sinceAll, fresh)),
    settle(fetchNetlify(range, SITES.grunion, client)),
    sbrfcOff ? offSite : settle(fetchNetlify(range, SITES.sbrfc, client)),
  ]);
  const report = assemble({ ga, gaS, meta, nl, nlS, range, today, sinceAll, days });
  return {
    days, range, today, sinceLaunch: sinceAll,
    configured: { ga: ga.configured !== false, sbrfc: gaS.configured !== false, meta: meta.configured !== false, netlify: nl.configured !== false },
    sources: {
      ga: { ok: !!ga.ok, error: ga.error || null, adsError: ga.adsError || null },
      sbrfcGa: { ok: !!gaS.ok, error: gaS.error || null, adsError: gaS.adsError || null, property: gaS.property || null },
      meta: { ok: !!meta.ok, error: meta.error || null, accounts: meta.accounts || [], discoverError: meta.discoverError || null },
      netlify: { ok: !!nl.ok, error: nl.error || null, spamSupported: nl.spamSupported ?? null, forms: nl.forms || [] },
      sbrfcNetlify: { ok: !!nlS.ok, error: nlS.error || null, spamSupported: nlS.spamSupported ?? null, forms: nlS.forms || [] },
    },
    ...report,
  };
}

export default async (req) => {
  const denied = gate(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const daysParam = url.searchParams.get('days') || '30';
  const fresh = url.searchParams.get('fresh') === '1';
  const hit = cache.get(daysParam);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return json({ ...hit.body, cachedAt: new Date(hit.at).toISOString() });
  try {
    const body = await buildReport({ daysParam, fresh });
    cache.set(daysParam, { at: Date.now(), body });
    return json({ ...body, cachedAt: null });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
};

// ============================================================================
// Grunion RFC dashboard — paid ads tracker (Google Ads + Meta + our own forms)
// GET /.netlify/functions/ads-stats?days=30        (7 | 30 | 90 | all)   [&fresh=1]
// Requires header  x-dashboard-key: <DASHBOARD_KEY env var>
//
// Joins three read-only sources by campaign name, so a new campaign on either
// platform shows up the day it spends. Nothing to register, nothing to type.
//   1. GA4 Data API (the dashboard's existing service account)
//      - Google Ads cost / impressions / clicks per campaign. GA4 only has these
//        once the Google Ads account is linked to the property (GA4 Admin →
//        Product links → Google Ads links). Google's cost lands in GA4 about a
//        day late, so a brand-new Google campaign shows visits before spend.
//      - Sessions + the lead_play / lead_coach / tap_text / tap_email events
//        the landing pages send, for every campaign on every platform.
//   2. Meta Marketing API (Facebook + Instagram share one ad account)
//      - campaign list with status and start date, spend / impressions / link
//        clicks and Meta's own lead counts (Instant Forms, Pixel), split by
//        publisher platform (facebook / instagram / …).
//   3. Netlify Forms (the dashboard's existing token)
//      - play-signup + coach-application submissions, read with the hidden
//        utm_* / gclid / fbclid / referrer fields the landing pages stamp on
//        them. These are the ground-truth leads.
//
// Env vars (Site configuration → Environment variables, scope: Functions):
//   DASHBOARD_KEY                        (required) shared dashboard passcode
//   GA_CLIENT_EMAIL + GA_PRIVATE_KEY     (or GA_SERVICE_ACCOUNT_JSON) — as ga-stats
//   GA_PROPERTY_ID                       numeric GA4 property id
//   NETLIFY_API_TOKEN                    as netlify-stats (NETLIFY_SITE_ID, SITE_DOMAIN optional)
//   META_ADS_TOKEN                       read-only system-user token with ads_read
//   META_AD_ACCOUNT_ID                   the ad account id, with or without "act_"
//   META_API_VERSION                     optional, default v23.0
//   ADS_START_DATE                       optional, YYYY-MM-DD; the "since launch"
//                                        range starts here (default 2026-09-01)
//
// Zero npm dependencies (node built-ins only), read-only against every API,
// answers are cached in memory for 10 minutes so committee refreshes never
// touch Meta's development-tier rate limit (60 calls per 5 minutes).
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
const NEW_DAYS = 14;                        // "NEW" badge window
const ACTIVE_DAYS = 3;                      // Google: spent in the last N days = active
const NO_LEADS_FLOOR = 50;                  // $ spent with zero leads → flag
const UNTAGGED_MIN_CLICKS = 10;             // Meta clicks before "untagged" is called
const LEAD_FORMS = { 'play-signup': 'play', 'coach-application': 'coach' };
const LEAD_EVENTS = ['lead_play', 'lead_coach', 'tap_text', 'tap_email'];
const META_SOURCES = new Set(['fb', 'ig', 'msg', 'an', 'facebook', 'instagram', 'meta', 'messenger', 'audience_network']);

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
const PLATFORM_LABEL = {
  google: 'Google Search', facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger',
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

// ============================================================================
// Source 1 — GA4
// ============================================================================
async function fetchGA(range, sinceAll) {
  let email = process.env.GA_CLIENT_EMAIL, pk = process.env.GA_PRIVATE_KEY;
  if ((!email || !pk) && process.env.GA_SERVICE_ACCOUNT_JSON) {
    try { const sa = JSON.parse(process.env.GA_SERVICE_ACCOUNT_JSON); email = email || sa.client_email; pk = pk || sa.private_key; } catch { /* handled below */ }
  }
  const property = process.env.GA_PROPERTY_ID;
  if (!email || !pk) return { configured: false, ok: false, error: 'GA service account not set (GA_CLIENT_EMAIL + GA_PRIVATE_KEY)' };
  if (!property) return { configured: false, ok: false, error: 'GA_PROPERTY_ID not set' };
  pk = pk.replace(/\\n/g, '\n');

  const token = await googleToken(email, pk);
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
  const trafficBatch = run([
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
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: LEAD_EVENTS } } },
      limit: '1000',
    },
  ]);

  const out = { configured: true, ok: true, error: null, adsError: null, googleCampaigns: [], googleDaily: [], traffic: [], events: [] };
  const [ads, traffic] = await Promise.allSettled([adsBatch, trafficBatch]);

  if (traffic.status === 'rejected') {
    out.ok = false; out.error = String(traffic.reason?.message || traffic.reason);
  } else {
    const [sess, ev] = traffic.value;
    out.traffic = rows(sess).map((r) => ({ source: dim(r, 0), medium: dim(r, 1), campaign: dim(r, 2), sessions: met(r, 0), engaged: met(r, 1) }));
    out.events = rows(ev).map((r) => ({ source: dim(r, 0), medium: dim(r, 1), campaign: dim(r, 2), event: dim(r, 3), count: met(r, 0) }));
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
// Source 2 — Meta Marketing API
// ============================================================================
async function fetchMeta(range, sinceAll) {
  const token = process.env.META_ADS_TOKEN;
  let account = String(process.env.META_AD_ACCOUNT_ID || '').trim();
  if (!token || !account) return { configured: false, ok: false, error: 'META_ADS_TOKEN / META_AD_ACCOUNT_ID not set' };
  if (!account.startsWith('act_')) account = `act_${account}`;
  const ver = process.env.META_API_VERSION || 'v23.0';
  const base = `${META_GRAPH}/${ver}/${account}`;

  const call = async (path, params, pages = 8) => {
    const url = new URL(`${base}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    url.searchParams.set('access_token', token);
    const all = [];
    let next = url.toString();
    for (let i = 0; i < pages && next; i++) {
      const r = await fetch(next);
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) {
        const e = data.error || {};
        throw new Error(`Meta API ${e.code ? `(${e.code}) ` : ''}${e.message || r.status}`);
      }
      all.push(...(data.data || []));
      next = data.paging?.next || null;
    }
    return all;
  };
  const timeRange = (since) => ({ since, until: range.until });
  const insightFields = 'campaign_id,campaign_name,spend,impressions,reach,clicks,inline_link_clicks,actions';

  const [camps, ins, split, daily] = await Promise.all([
    call('campaigns', { fields: 'id,name,status,effective_status,objective,created_time,start_time,stop_time,daily_budget,lifetime_budget', limit: '200' }),
    call('insights', { level: 'campaign', fields: insightFields, time_range: timeRange(range.since), limit: '200' }),
    call('insights', { level: 'campaign', fields: insightFields, breakdowns: 'publisher_platform', time_range: timeRange(range.since), limit: '500' }),
    call('insights', { level: 'campaign', fields: 'campaign_id,campaign_name,spend,inline_link_clicks,impressions,actions', time_increment: '1', time_range: timeRange(sinceAll), limit: '500' }),
  ]);

  const actionsOf = (row) => {
    const map = {};
    for (const a of row.actions || []) map[a.action_type] = num(a.value);
    return map;
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
    leads: leadCounts(row),
  });
  return {
    configured: true, ok: true, error: null,
    campaigns: camps.map((c) => ({
      id: c.id, name: c.name, status: c.status, effectiveStatus: c.effective_status, objective: c.objective,
      created: c.created_time ? ptDate(new Date(c.created_time)) : null,
      start: c.start_time ? ptDate(new Date(c.start_time)) : null,
      stop: c.stop_time ? ptDate(new Date(c.stop_time)) : null,
      dailyBudget: c.daily_budget != null ? num(c.daily_budget) / 100 : null,
      lifetimeBudget: c.lifetime_budget != null ? num(c.lifetime_budget) / 100 : null,
    })),
    insights: ins.map(norm),
    split: split.map((row) => ({ ...norm(row), platform: lower(row.publisher_platform) || 'unknown' })),
    daily: daily.map((row) => ({ ...norm(row), date: row.date_start })),
  };
}

// ============================================================================
// Source 3 — Netlify Forms (our own leads)
// ============================================================================
async function fetchNetlify(range) {
  const token = process.env.NETLIFY_API_TOKEN;
  if (!token) return { configured: false, ok: false, error: 'NETLIFY_API_TOKEN not set' };
  const headers = { Authorization: `Bearer ${token}` };
  const getJ = async (url) => {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Netlify API ${r.status} on ${url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')}`);
    return r.json();
  };

  // resolve the site (same logic as netlify-stats)
  const wantDomain = (process.env.SITE_DOMAIN || 'grunionrugby.com').toLowerCase();
  let site = null;
  if (process.env.NETLIFY_SITE_ID) site = await getJ(`${NETLIFY_API}/sites/${process.env.NETLIFY_SITE_ID}`).catch(() => null);
  if (!site) {
    const sites = await getJ(`${NETLIFY_API}/sites?filter=all&per_page=100`);
    const matches = (s, d) =>
      [s.custom_domain, s.default_domain, ...(s.domain_aliases || [])].filter(Boolean)
        .some((x) => String(x).toLowerCase() === d || String(x).toLowerCase().endsWith(`.${d}`)) ||
      String(s.url || '').toLowerCase().includes(d);
    site = sites.find((s) => matches(s, wantDomain)) || sites.find((s) => String(s.name || '').toLowerCase().includes('grunion')) || sites[0];
    if (!site) throw new Error('No sites visible to this token');
  }
  const siteId = site.id || site.site_id;

  const forms = (await getJ(`${NETLIFY_API}/sites/${siteId}/forms`)).filter((f) => LEAD_FORMS[f.name]);
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
    const kind = LEAD_FORMS[f.name];
    const verified = await listAll(f.id);
    const ids = new Set(verified.map((s) => s.id));
    for (const s of verified) {
      const d = s.data || {};
      const at = s.created_at || '';
      const day = at ? ptDate(new Date(at)) : null;
      const fields = {
        utm_source: d.utm_source, utm_medium: d.utm_medium, utm_campaign: d.utm_campaign, utm_content: d.utm_content, utm_term: d.utm_term,
        gclid: d.gclid, gbraid: d.gbraid, wbraid: d.wbraid, fbclid: d.fbclid, referrer: d.referrer, landing: d.landing,
      };
      leads.push({
        id: s.id, at, day, form: kind, name: d.name || s.name || '',
        platform: classifyPlatform(fields),
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
function assemble({ ga, meta, nl, range, today, sinceAll, days }) {
  const inRange = (day) => day && day >= range.since && day <= range.until;
  const warnings = [];
  const campaigns = [];

  // ---- Google campaigns (from GA4's Google Ads dimensions) ----------------
  const gById = new Map(), gByName = new Map();
  const gAll = new Map(); // name → {first,last,id}
  for (const d of (ga.googleDaily || [])) {
    const active = d.cost > 0 || d.impressions > 0 || d.clicks > 0;
    if (!active) continue;
    const g = gAll.get(d.name) || { name: d.name, id: d.id, first: d.date, last: d.date };
    if (d.date < g.first) g.first = d.date;
    if (d.date > g.last) g.last = d.date;
    gAll.set(d.name, g);
  }
  for (const c of (ga.googleCampaigns || [])) if (!gAll.has(c.name)) gAll.set(c.name, { name: c.name, id: c.id, first: null, last: null });
  for (const g of gAll.values()) { if (g.id) gById.set(String(g.id), g.name); gByName.set(g.name, g); }

  const gaTraffic = ga.traffic || [], gaEvents = ga.events || [];
  const sessionsFor = (pred) => {
    let sessions = 0, engaged = 0;
    for (const t of gaTraffic) if (pred(t)) { sessions += t.sessions; engaged += t.engaged; }
    return { sessions, engaged };
  };
  const eventsFor = (pred) => {
    const out = { lead_play: 0, lead_coach: 0, tap_text: 0, tap_email: 0 };
    for (const e of gaEvents) if (pred(e) && e.event in out) out[e.event] += e.count;
    return out;
  };
  const isGoogleRow = (t) => gaPlatform(t.source, t.medium) === 'google';
  const isMetaRow = (t) => isMetaPlatform(gaPlatform(t.source, t.medium) || '');

  const siteLeads = nl.leads || [];
  const leadsIn = siteLeads.filter((l) => inRange(l.day));
  const leadsFor = (pred) => {
    const out = { play: 0, coach: 0, total: 0 };
    for (const l of leadsIn) if (pred(l)) { out[l.form] += 1; out.total += 1; }
    return out;
  };

  for (const g of gAll.values()) {
    const cur = (ga.googleCampaigns || []).find((c) => c.name === g.name) || { cost: 0, impressions: 0, clicks: 0, sessions: 0, engaged: 0, type: '' };
    const inRangeDays = (ga.googleDaily || []).filter((d) => d.name === g.name && inRange(d.date) && (d.cost > 0 || d.impressions > 0));
    if (!inRangeDays.length && !(cur.cost > 0 || cur.impressions > 0) && days !== 'all') continue; // nothing in this window
    const sess = sessionsFor((t) => isGoogleRow(t) && t.campaign === g.name);
    const ev = eventsFor((e) => isGoogleRow(e) && e.campaign === g.name);
    const leads = leadsFor((l) => l.platform === 'google' && (l.campaign === String(g.id) || l.campaign === g.name));
    const lastActive = g.last;
    const status = !lastActive ? 'No spend yet' : daysBetween(lastActive, today) <= ACTIVE_DAYS ? 'Active' : 'Inactive';
    campaigns.push(row({
      key: `google:${g.name}`, platform: 'google', platformLabel: 'Google Search', name: g.name, id: g.id || null,
      kind: cur.type || null, status, statusRaw: null, firstSeen: g.first, lastSeen: lastActive,
      spend: cur.cost, impressions: cur.impressions, reach: null, clicks: cur.clicks, allClicks: cur.clicks,
      sessions: cur.sessions || sess.sessions, engaged: cur.engaged || sess.engaged,
      siteLeads: leads, instantLeads: 0, pixelLeads: 0, taps: { text: ev.tap_text, email: ev.tap_email },
      gaLeads: { play: ev.lead_play, coach: ev.lead_coach }, split: null, dailyBudget: null,
    }, today));
  }
  // Google traffic arriving with no cost data → the Google Ads ↔ GA4 link is missing
  const googleSessions = sessionsFor(isGoogleRow).sessions;
  if (ga.ok && !ga.adsError && !gAll.size && googleSessions > 0) {
    warnings.push({ level: 'warn', text: `GA4 sees ${googleSessions} Google Ads visits but no Google Ads cost data. Link the Google Ads account to GA4 (Admin → Product links → Google Ads links), or the ads only started today (cost lands in GA4 a day late).` });
  }
  if (ga.adsError) warnings.push({ level: 'warn', text: `Google Ads figures unavailable from GA4: ${ga.adsError}` });

  // ---- Meta campaigns -------------------------------------------------------
  if (meta.ok) {
    const insByName = new Map((meta.insights || []).map((i) => [i.name, i]));
    const dailyByName = new Map();
    for (const d of (meta.daily || [])) {
      const arr = dailyByName.get(d.name) || [];
      arr.push(d); dailyByName.set(d.name, arr);
    }
    const splitByName = new Map();
    for (const s of (meta.split || [])) {
      const m = splitByName.get(s.name) || {};
      m[s.platform] = s; splitByName.set(s.name, m);
    }
    const seen = new Set();
    const metaList = (meta.campaigns || []).slice();
    for (const i of (meta.insights || [])) if (!metaList.some((c) => c.name === i.name)) metaList.push({ id: i.id, name: i.name, effectiveStatus: null });
    for (const c of metaList) {
      if (seen.has(c.name)) continue; seen.add(c.name);
      const st = String(c.effectiveStatus || c.status || '').toUpperCase();
      if (st === 'ARCHIVED' || st === 'DELETED') continue;
      const ins = insByName.get(c.name) || { spend: 0, impressions: 0, reach: 0, clicks: 0, allClicks: 0, leads: { instant: 0, pixel: 0, total: 0 } };
      const dl = (dailyByName.get(c.name) || []).filter((d) => d.spend > 0 || d.impressions > 0);
      const first = dl.length ? dl.reduce((m, d) => (d.date < m ? d.date : m), dl[0].date) : (c.start || c.created || null);
      const last = dl.length ? dl.reduce((m, d) => (d.date > m ? d.date : m), dl[0].date) : null;
      const recentlyMade = !!(c.created && daysBetween(c.created, today) <= 30);
      const live = ['ACTIVE', 'IN_PROCESS', 'PENDING_REVIEW', 'WITH_ISSUES', 'PREAPPROVED'].includes(st);
      const ranInRange = ins.spend > 0 || ins.impressions > 0;
      // Show it if it ran in this window, is live or about to be, was made in the
      // last 30 days, or (since-launch view) ever ran. Old drafts stay hidden.
      if (!ranInRange && !live && !recentlyMade && !(days === 'all' && dl.length)) continue;
      const sess = sessionsFor((t) => isMetaRow(t) && t.campaign === c.name);
      const ev = eventsFor((e) => isMetaRow(e) && e.campaign === c.name);
      const leads = leadsFor((l) => isMetaPlatform(l.platform) && l.campaign === c.name);
      const sp = splitByName.get(c.name) || {};
      const status = c.stop && c.stop < today && st !== 'ACTIVE' ? 'Ended'
        : ({ ACTIVE: 'Active', PAUSED: 'Paused', CAMPAIGN_PAUSED: 'Paused', ADSET_PAUSED: 'Paused (ad set)', IN_PROCESS: 'Starting', PENDING_REVIEW: 'In review', WITH_ISSUES: 'Has issues', DISAPPROVED: 'Disapproved', PREAPPROVED: 'Approved' }[st] || (st ? st.toLowerCase() : 'Unknown'));
      const flags = [];
      if (ins.clicks >= UNTAGGED_MIN_CLICKS && sess.sessions === 0 && ins.leads.instant === 0) flags.push('untagged');
      campaigns.push(row({
        key: `meta:${c.name}`, platform: 'meta', platformLabel: 'Facebook / Instagram', name: c.name, id: c.id || null,
        kind: c.objective ? String(c.objective).replace(/^OUTCOME_/, '').toLowerCase() : null, status, statusRaw: st || null,
        firstSeen: first, lastSeen: last,
        spend: ins.spend, impressions: ins.impressions, reach: ins.reach || null, clicks: ins.clicks, allClicks: ins.allClicks,
        sessions: sess.sessions, engaged: sess.engaged,
        siteLeads: leads, instantLeads: ins.leads.instant, pixelLeads: ins.leads.pixel, taps: { text: ev.tap_text, email: ev.tap_email },
        gaLeads: { play: ev.lead_play, coach: ev.lead_coach },
        split: Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, { spend: round(v.spend), impressions: v.impressions, clicks: v.clicks, instantLeads: v.leads.instant }])),
        dailyBudget: c.dailyBudget ?? null, extraFlags: flags,
      }, today));
    }
  }

  // ---- platform roll-ups ----------------------------------------------------
  const platforms = [];
  const gRows = campaigns.filter((c) => c.platform === 'google');
  const gSum = (k) => gRows.reduce((a, c) => a + (c[k] || 0), 0);
  platforms.push(platformRow('google', 'Google Search', {
    spend: gSum('spend'), impressions: gSum('impressions'), clicks: gSum('clicks'),
    sessions: gSum('sessions'), engaged: gSum('engaged'),
    siteLeads: leadsFor((l) => l.platform === 'google').total, instantLeads: 0,
    taps: gRows.reduce((a, c) => a + c.taps.text + c.taps.email, 0),
  }));
  if (meta.ok) {
    const byPlat = {};
    for (const s of (meta.split || [])) {
      const p = byPlat[s.platform] || (byPlat[s.platform] = { spend: 0, impressions: 0, clicks: 0, instantLeads: 0 });
      p.spend += s.spend; p.impressions += s.impressions; p.clicks += s.clicks; p.instantLeads += s.leads.instant;
    }
    const order = ['facebook', 'instagram', 'messenger', 'audience_network', 'unknown'];
    const keys = Object.keys(byPlat).sort((a, b) => (order.indexOf(a) + 100) % 100 - (order.indexOf(b) + 100) % 100);
    for (const k of ['facebook', 'instagram']) if (!keys.includes(k)) keys.push(k);
    for (const k of keys) {
      const p = byPlat[k] || { spend: 0, impressions: 0, clicks: 0, instantLeads: 0 };
      const plat = k === 'audience_network' ? 'audience_network' : k;
      const sess = sessionsFor((t) => gaPlatform(t.source, t.medium) === plat);
      const ev = eventsFor((e) => gaPlatform(e.source, e.medium) === plat);
      platforms.push(platformRow(plat, platformLabel(plat), {
        spend: p.spend, impressions: p.impressions, clicks: p.clicks, sessions: sess.sessions, engaged: sess.engaged,
        siteLeads: leadsFor((l) => l.platform === plat).total, instantLeads: p.instantLeads, taps: ev.tap_text + ev.tap_email,
      }));
    }
  }
  // Facebook/Instagram visits that carried no campaign tags: an untagged ad or
  // the club's own bio link. Listed so the totals reconcile, never as paid leads.
  {
    const sess = sessionsFor((t) => gaPlatform(t.source, t.medium) === 'meta_untagged');
    const ev = eventsFor((e) => gaPlatform(e.source, e.medium) === 'meta_untagged');
    const untagged = leadsFor((l) => l.platform === 'meta_untagged').total;
    // spend / impressions / clicks are null here on purpose: "not applicable", not zero
    if (untagged || sess.sessions) platforms.push(platformRow('meta_untagged', 'Facebook / Instagram, not paid', { spend: null, impressions: null, clicks: null, sessions: sess.sessions, engaged: sess.engaged, siteLeads: untagged, instantLeads: 0, taps: ev.tap_text + ev.tap_email }));
  }
  const other = leadsFor((l) => !['google', 'facebook', 'instagram', 'messenger', 'audience_network', 'meta_untagged'].includes(l.platform));
  if (other.total) platforms.push(platformRow('other', 'Not from an ad (direct, organic, other)', { spend: null, impressions: null, clicks: null, sessions: null, engaged: null, siteLeads: other.total, instantLeads: 0, taps: null }));

  // ---- totals ----------------------------------------------------------------
  const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const googleSpend = gSum('spend');
  const metaSpend = meta.ok ? sum(meta.insights || [], (i) => i.spend) : 0;
  const spend = googleSpend + metaSpend;
  const clicks = gSum('clicks') + (meta.ok ? sum(meta.insights || [], (i) => i.clicks) : 0);
  const impressions = gSum('impressions') + (meta.ok ? sum(meta.insights || [], (i) => i.impressions) : 0);
  const instantLeads = meta.ok ? sum(meta.insights || [], (i) => i.leads.instant) : 0;
  const pixelLeads = meta.ok ? sum(meta.insights || [], (i) => i.leads.pixel) : 0;
  const adLeads = leadsFor((l) => l.platform === 'google' || isMetaPlatform(l.platform));
  const untaggedSocialLeads = leadsFor((l) => l.platform === 'meta_untagged');
  const allSiteLeads = leadsFor(() => true);
  const tapsAds = sum(campaigns, (c) => c.taps.text + c.taps.email);
  const tapsAll = eventsFor(() => true);
  const leads = adLeads.total + instantLeads;
  const totals = {
    spend: round(spend), googleSpend: round(googleSpend), metaSpend: round(metaSpend),
    impressions, clicks, cpc: round(safeDiv(spend, clicks)),
    leads, siteLeadsFromAds: adLeads, siteLeadsUntaggedSocial: untaggedSocialLeads, siteLeadsAll: allSiteLeads, instantLeads, pixelLeads,
    cpl: round(safeDiv(spend, leads)), clickToLead: pct(leads, clicks),
    taps: tapsAds, tapsAllVisitors: tapsAll.tap_text + tapsAll.tap_email,
    sessions: sum(campaigns, (c) => c.sessions),
  };

  // ---- flags + warnings -----------------------------------------------------
  for (const c of campaigns) {
    if (c.spend >= NO_LEADS_FLOOR && c.leads === 0) c.flags.push('no_leads');
    if (c.isNew) c.flags.push('new');
  }
  campaigns.sort((a, b) => (b.spend - a.spend) || (b.lastSeen || '').localeCompare(a.lastSeen || ''));
  const untaggedCamps = campaigns.filter((c) => c.flags.includes('untagged'));
  if (untaggedCamps.length) warnings.push({ level: 'warn', text: `${untaggedCamps.map((c) => `"${c.name}"`).join(', ')}: Meta reports clicks but no tagged visits reached the site. Add the URL parameters line to that campaign's ads (DASHBOARD-SETUP.md) unless it uses Instant Forms.` });
  if (nl.ok && nl.spamSupported && nl.spamCount > 0) warnings.push({ level: 'warn', text: `${nl.spamCount} form submission${nl.spamCount === 1 ? ' in this range sits' : 's in this range sit'} in Netlify's spam folder. Check Forms → Spam submissions; real ones can be marked verified.` });
  if (meta.configured === false) warnings.push({ level: 'info', text: 'Meta is not connected yet: add META_ADS_TOKEN and META_AD_ACCOUNT_ID in Netlify env vars, then redeploy. Facebook and Instagram figures appear after that.' });
  else if (!meta.ok) warnings.push({ level: 'warn', text: `Meta error: ${meta.error}` });
  if (ga.configured === false) warnings.push({ level: 'warn', text: `Google Analytics is not connected: ${ga.error}` });
  else if (!ga.ok) warnings.push({ level: 'warn', text: `Google Analytics error: ${ga.error}` });
  if (nl.configured === false) warnings.push({ level: 'warn', text: `Netlify is not connected: ${nl.error}` });
  else if (!nl.ok) warnings.push({ level: 'warn', text: `Netlify error: ${nl.error}` });
  const untaggedLeads = leadsIn.filter((l) => !l.tagged).length;
  if (leadsIn.length && untaggedLeads === leadsIn.length && (spend > 0)) warnings.push({ level: 'info', text: 'None of the recent site leads carried campaign tags. If the landing-page change has not been deployed yet, that is expected.' });

  // ---- daily series (in range) ------------------------------------------------
  const daily = [];
  for (let d = range.since; d <= range.until; d = addDays(d, 1)) {
    const gD = (ga.googleDaily || []).filter((x) => x.date === d);
    const mD = (meta.daily || []).filter((x) => x.date === d);
    daily.push({
      date: d,
      googleSpend: round(sum(gD, (x) => x.cost)),
      metaSpend: round(sum(mD, (x) => x.spend)),
      siteLeads: leadsIn.filter((l) => l.day === d).length,
      instantLeads: sum(mD, (x) => x.leads.instant),
    });
  }

  const recentLeads = siteLeads.slice(0, 20).map((l) => ({
    at: l.at, form: l.form, name: l.name, platform: l.platform, platformLabel: platformLabel(l.platform),
    campaign: l.platform === 'google' ? (gById.get(l.campaign) || l.campaign) : l.campaign, ad: l.ad, term: l.term, tagged: l.tagged,
  }));

  return { totals, platforms, campaigns, daily, recentLeads, warnings };
}

function row(c, today) {
  const leads = c.siteLeads.total + c.instantLeads;
  const goal = /coach/i.test(c.name) ? 'Coach' : (c.siteLeads.coach > c.siteLeads.play ? 'Coach' : 'Players');
  return {
    key: c.key, platform: c.platform, platformLabel: c.platformLabel, name: c.name, id: c.id, kind: c.kind, goal,
    status: c.status, statusRaw: c.statusRaw, firstSeen: c.firstSeen, lastSeen: c.lastSeen,
    daysRunning: c.firstSeen ? Math.max(1, daysBetween(c.firstSeen, today) + 1) : null,
    isNew: !!(c.firstSeen && daysBetween(c.firstSeen, today) < NEW_DAYS),
    spend: round(c.spend), impressions: c.impressions, reach: c.reach, clicks: c.clicks, allClicks: c.allClicks,
    ctr: pct(c.clicks, c.impressions, 2), cpc: round(safeDiv(c.spend, c.clicks)),
    sessions: c.sessions, engaged: c.engaged, engagementRate: pct(c.engaged, c.sessions),
    siteLeads: c.siteLeads, instantLeads: c.instantLeads, pixelLeads: c.pixelLeads, gaLeads: c.gaLeads, leads,
    cpl: round(safeDiv(c.spend, leads)), clickToLead: pct(leads, c.clicks),
    taps: c.taps, split: c.split, dailyBudget: c.dailyBudget, flags: (c.extraFlags || []).slice(),
  };
}
const PLATFORM_NOTES = {
  meta_untagged: 'Visits and leads from Facebook or Instagram that carried no paid-ad tags: the club\'s own posts and bio link, a share, or an ad whose URL parameters are missing. Never counted as paid leads.',
  other: 'Site leads whose visit carried no ad tags at all: direct, organic search, word of mouth.',
};
function platformRow(key, label, p) {
  const leads = p.siteLeads + p.instantLeads;
  const na = p.spend == null; // rows with no ad spend behind them: nothing to divide by
  return {
    key, label, note: PLATFORM_NOTES[key] || null, spend: round(p.spend), impressions: p.impressions, clicks: p.clicks,
    ctr: na ? null : pct(p.clicks, p.impressions, 2), cpc: na ? null : round(safeDiv(p.spend, p.clicks)),
    sessions: p.sessions, engaged: p.engaged, engagementRate: p.sessions == null ? null : pct(p.engaged, p.sessions),
    siteLeads: p.siteLeads, instantLeads: p.instantLeads, leads,
    cpl: na ? null : round(safeDiv(p.spend, leads)), clickToLead: na ? null : pct(leads, p.clicks), taps: p.taps,
  };
}

// ============================================================================
// Handler
// ============================================================================
const cache = new Map(); // days → { at, body }

async function buildReport({ daysParam }) {
  const today = ptDate();
  const sinceAll = validDate(process.env.ADS_START_DATE) ? process.env.ADS_START_DATE : DEFAULT_START;
  const days = daysParam === 'all' ? 'all' : ([7, 30, 90].includes(Number(daysParam)) ? Number(daysParam) : 30);
  const range = { since: days === 'all' ? sinceAll : addDays(today, -(days - 1)), until: today };
  if (range.since > today) range.since = today;

  const settle = (p) => p.then((v) => v).catch((e) => ({ configured: true, ok: false, error: String(e.message || e) }));
  const [ga, meta, nl] = await Promise.all([settle(fetchGA(range, sinceAll)), settle(fetchMeta(range, sinceAll)), settle(fetchNetlify(range))]);
  const report = assemble({ ga, meta, nl, range, today, sinceAll, days });
  return {
    days, range, today, sinceLaunch: sinceAll,
    configured: { ga: ga.configured !== false, meta: meta.configured !== false, netlify: nl.configured !== false },
    sources: {
      ga: { ok: !!ga.ok, error: ga.error || null, adsError: ga.adsError || null },
      meta: { ok: !!meta.ok, error: meta.error || null },
      netlify: { ok: !!nl.ok, error: nl.error || null, spamSupported: nl.spamSupported ?? null, forms: nl.forms || [] },
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
    const body = await buildReport({ daysParam });
    cache.set(daysParam, { at: Date.now(), body });
    return json({ ...body, cachedAt: null });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
};

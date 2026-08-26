// ============================================================================
// Grunion Sponsor Board — live roll-up of the jersey-tile email campaign
//
//   GET /board/<BOARD_SLUG>/        the page (phone-first, self-contained)
//   GET /board/<BOARD_SLUG>/data    JSON the page renders (add ?refresh=1 to
//                                   skip the ~2-minute cache)
//   anything else under /board/     404 — the random slug is the only gate
//
// Env vars (Site configuration → Environment variables, scope: Functions):
//   BOARD_SLUG     (required)  the random segment of the hidden URL
//   INSTANTLY_KEY  (required)  read-only Instantly API v2 key (scope all:read)
//
// Read-only against Instantly by construction: this file only ever issues GET
// requests. No email is sent and nothing is created, changed, or deleted.
// Dependency-free (node built-ins only) like the dashboard functions.
// ============================================================================

import { timingSafeEqual, createHash } from 'node:crypto';
import { TITLE, CSS, BODY, JS } from './page.mjs';

export const config = { path: '/board/*' };

// ---- campaign facts ---------------------------------------------------------
const PROD_ID = '5a76e2ad-15a1-40af-81af-2475a69bd4dc'; // "Grunion Jersey Tiles — Fall 2026 (PROD)"
const INBOXES = ['treasurer@grunionrugbyclub.com', 'merman@grunionrugbyclub.com'];
const END_DATE = '2026-10-16'; // sending ends Fri Oct 16, 2026 (Pacific)
const END_LABEL = 'Fri Oct 16';
const TZ = 'America/Los_Angeles';
const DAYS = 14; // daily chart window (UTC days, matching Instantly)

// Everything that is not a test campaign is combined into one set of numbers.
// Test campaigns are excluded from every number; matched on whole words so a
// business called e.g. "Contest Cafe" can never be mistaken for a test.
const TEST_RE = /\b(TEST|FORMAT|TIMING)\b/i;

// ---- Instantly ------------------------------------------------------------
const API = 'https://api.instantly.ai/api/v2';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 GRC-board/1.0';
const BUDGET_MS = 9000; // stay under the 10 s function limit
const REQ_MS = 7000;

const ACCOUNT_STATUS = { 1: 'Active', 2: 'Paused', '-1': 'Connection error', '-2': 'Soft bounce error', '-3': 'Sending error' };
const WARMUP_STATUS = { 0: 'Warmup paused', 1: 'Warmup active', '-1': 'Warmup banned', '-2': 'Warmup: spam folder', '-3': 'Warmup suspended' };

// ---- cache (per warm function instance) --------------------------------------
const CACHE_MS = 2 * 60 * 1000;   // serve the same payload for ~2 minutes
const REFRESH_MIN_MS = 15 * 1000; // ?refresh=1 still can't hammer Instantly
let cache = null;   // { at, payload } — last successful build
let inflight = null; // de-duplicates concurrent builds

// ---- page -------------------------------------------------------------------
const PAGE = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  '<meta name="robots" content="noindex, nofollow, noarchive">',
  '<meta name="referrer" content="no-referrer">',
  `<title>${TITLE}</title>`,
  '<link rel="icon" type="image/png" href="/assets/favicon.png">',
  '<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">',
  `<style>${CSS}</style>`,
  '</head>',
  '<body>',
  BODY,
  `<script>${JS}</script>`,
  '</body>',
  '</html>',
].join('\n');
const SCRIPT_HASH = "'sha256-" + createHash('sha256').update(JS).digest('base64') + "'";
// 'self' is there for the Real User Monitoring tag Netlify appends to every HTML
// response on this site (/.netlify/scripts/rum); the page's own script is hashed.
const CSP = [
  "default-src 'none'",
  `script-src 'self' ${SCRIPT_HASH}`,
  "style-src 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const PRIVATE_HEADERS = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

const html = (body, status = 200, extra = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...PRIVATE_HEADERS, ...extra } });
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...PRIVATE_HEADERS } });
const notFound = () => html('<!doctype html><title>Not found</title><p>Not found.</p>', 404);

function slugOk(given) {
  const expected = process.env.BOARD_SLUG || '';
  if (!expected || !given) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---- date helpers ------------------------------------------------------------
const ptFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const ptDate = (d) => ptFmt.format(d); // "2026-08-25" in Pacific time
const utcDate = (d) => d.toISOString().slice(0, 10);
const daysBetween = (fromYmd, toYmd) => {
  const [fy, fm, fd] = fromYmd.split('-').map(Number);
  const [ty, tm, td] = toYmd.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
};
const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? 0 : Number(v));

// ---- Instantly client ----------------------------------------------------------
function client(key, deadline) {
  const get = async (path, params = {}) => {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
    const ms = Math.min(REQ_MS, Math.max(1500, deadline - Date.now()));
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`Instantly ${r.status} on ${path}${body ? ': ' + body.slice(0, 120) : ''}`);
    }
    return r.json();
  };
  // Paginated list endpoints ({ items, next_starting_after }).
  const list = async (path, params = {}, maxPages = 10) => {
    const items = [];
    let after = null;
    for (let i = 0; i < maxPages; i++) {
      const r = await get(path, { ...params, limit: 100, ...(after ? { starting_after: after } : {}) });
      const page = Array.isArray(r?.items) ? r.items : [];
      items.push(...page);
      if (page.length < 100 || !r.next_starting_after) break;
      after = r.next_starting_after;
    }
    return items;
  };
  // Read-only search endpoints that Instantly exposes as POST (e.g. /leads/list).
  const post = async (path, body = {}) => {
    const ms = Math.min(REQ_MS, Math.max(1500, deadline - Date.now()));
    const r = await fetch(API + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`Instantly ${r.status} on ${path}${text ? ': ' + text.slice(0, 120) : ''}`);
    }
    return r.json();
  };
  return { get, list, post };
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// Sent emails for one inbox on today's Pacific date (newest first from the API).
async function sentToday(api, inbox, todayPT) {
  const hits = [];
  let after = null;
  for (let page = 0; page < 5; page++) {
    const r = await api.get('/emails', { limit: 100, email_type: 'sent', eaccount: inbox, ...(after ? { starting_after: after } : {}) });
    const items = Array.isArray(r?.items) ? r.items : [];
    for (const e of items) {
      const ts = e.timestamp_email || e.timestamp_created;
      if (ts && ptDate(new Date(ts)) === todayPT) hits.push({ campaign_id: e.campaign_id || null });
    }
    const last = items[items.length - 1];
    const lastTs = last && (last.timestamp_email || last.timestamp_created);
    if (!last || !r.next_starting_after || !lastTs || ptDate(new Date(lastTs)) !== todayPT) break;
    after = r.next_starting_after;
  }
  return hits;
}

function isTest(c) {
  if (c.id === PROD_ID) return false;
  return TEST_RE.test(String(c.name || ''));
}

function inboxLevel(a) {
  const notes = [];
  let level = 'good';
  if (a.status !== 1) { level = 'crit'; notes.push(ACCOUNT_STATUS[a.status] || `Status ${a.status}`); }
  if (a.warmup_status !== 1) { if (level === 'good') level = 'warn'; notes.push(WARMUP_STATUS[a.warmup_status] || `Warmup status ${a.warmup_status}`); }
  const score = a.stat_warmup_score;
  if (score != null) {
    if (score < 75) { level = 'crit'; notes.push(`Warmup score ${score}`); }
    else if (score < 90 && level === 'good') { level = 'warn'; notes.push(`Warmup score ${score}`); }
  }
  return { level, note: notes.join(' · ') || null };
}

// ---- replies & opt-outs -------------------------------------------------------
// Instantly only counts an unsubscribe when the recipient uses the unsubscribe
// button (List-Unsubscribe header) — a business that *replies* "please remove us"
// is just a reply to Instantly. The board counts both, and lists who.
const AUTO_SUBJECT_RE = /auto[- ]?(response|reply|matic reply)|automatic reply|out of (the )?office|\booo\b|away from (the )?office|on leave|vacation|autoreply/i;
const AUTO_BODY_RE = /^\W*(this is an )?auto(mat(ic|ed))? ?(reply|response)|^\W*(i am|i'm) (currently )?(out of (the )?office|away|on leave|travell?ing)/i;
const OPTOUT_RE = /\b(unsubscribe|opt[- ]?out|remove (me|us|my|our)|take (me|us) off|stop (emailing|sending|contacting)|do not (email|contact)|don'?t (email|contact)|no longer (wish|want)|not interested|please remove|no thank(s| you))\b/i;

function clip(str, max) {
  if (str.length <= max) return str;
  const cut = str.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + '…';
}

function ownText(body) {
  // the reply's own words: drop quoted original text and signatures
  const text = (body && typeof body === 'object' ? body.text : body) || '';
  let t = String(text).replace(/\r/g, '');
  const cut = t.search(/^\s*(On .{0,200}wrote:|From: .*|-{2,}\s*Original Message|_{5,}|Sent from my )/m);
  if (cut > 0) t = t.slice(0, cut);
  return t.split('\n').filter((l) => !l.trim().startsWith('>')).join('\n').trim();
}

async function recentReplies(api, liveIds) {
  const out = [];
  let after = null;
  for (let page = 0; page < 3; page++) {
    const r = await api.get('/emails', { limit: 100, email_type: 'received', ...(after ? { starting_after: after } : {}) });
    const items = Array.isArray(r?.items) ? r.items : [];
    for (const e of items) {
      if (!e.campaign_id || !liveIds.has(e.campaign_id)) continue;
      const subject = String(e.subject || '');
      const text = ownText(e.body);
      const auto = AUTO_SUBJECT_RE.test(subject) || AUTO_BODY_RE.test(text.slice(0, 240));
      const optout = !auto && (OPTOUT_RE.test(subject) || OPTOUT_RE.test(text.slice(0, 600)));
      out.push({
        email: String(e.from_address_email || e.lead || '').trim(),
        inbox: String(e.eaccount || '').split('@')[0] + '@',
        when: e.timestamp_email || e.timestamp_created || null,
        kind: optout ? 'optout' : auto ? 'auto' : 'reply',
        subject: subject.replace(/\s+/g, ' ').trim().slice(0, 120),
        preview: clip((text || String(e.content_preview || '')).replace(/\s+/g, ' ').trim(), 140),
      });
    }
    if (items.length < 100 || !r.next_starting_after) break;
    after = r.next_starting_after;
  }
  out.sort((a, b) => Date.parse(b.when || 0) - Date.parse(a.when || 0));
  return out;
}

// Leads Instantly itself marked unsubscribed (unsubscribe button). This is a
// search, not a change — but it is a POST, so it may be refused for a read-only
// key; the count still comes from the analytics endpoint either way.
async function unsubscribedLeads(api, campaignIds) {
  const found = [];
  for (const id of campaignIds) {
    const r = await api.post('/leads/list', { campaign: id, filter: 'FILTER_VAL_UNSUBSCRIBED', limit: 100 });
    for (const l of Array.isArray(r?.items) ? r.items : []) {
      found.push({ email: String(l.email || '').trim(), when: l.timestamp_updated || null, source: 'button' });
    }
  }
  return found;
}

// ---- the roll-up --------------------------------------------------------------
async function build(key) {
  const started = Date.now();
  const deadline = started + BUDGET_MS;
  const api = client(key, deadline);
  const now = new Date();
  const todayPT = ptDate(now);
  const warnings = [];

  // window of UTC days for the chart
  const days = [];
  for (let i = DAYS - 1; i >= 0; i--) days.push(utcDate(new Date(now.getTime() - i * 86400000)));

  // Phase 1 — everything that doesn't depend on the campaign list
  const [campaignsRaw, analyticsRaw, accountsRaw, blockRaw, ...todayByInbox] = await Promise.all([
    api.list('/campaigns'),
    api.get('/campaigns/analytics'),
    api.list('/accounts'),
    api.list('/block-lists-entries').catch(() => null),
    ...INBOXES.map((inbox) => sentToday(api, inbox, todayPT).catch(() => { warnings.push(`Today's sends unavailable for ${inbox.split('@')[0]}@`); return null; })),
  ]);

  const analytics = new Map();
  for (const a of Array.isArray(analyticsRaw) ? analyticsRaw : []) analytics.set(a.campaign_id, a);

  const rows = (Array.isArray(campaignsRaw) ? campaignsRaw : []).map((c) => {
    const a = analytics.get(c.id) || {};
    return {
      id: c.id,
      test: isTest(c),
      leads: num(a.leads_count),
      contacted: num(a.contacted_count),
      sent: num(a.emails_sent_count),
      replies: num(a.reply_count_unique ?? a.reply_count),
      replies_auto: num(a.reply_count_automatic_unique ?? a.reply_count_automatic),
      bounced: num(a.bounced_count),
      unsubscribed: num(a.unsubscribed_count),
    };
  });
  const live = rows.filter((r) => !r.test);
  const tests = rows.filter((r) => r.test);
  const liveIds = new Set(live.map((r) => r.id));

  // Phase 2 — daily sends per live campaign (Instantly only accepts one id per
  // call), recent replies, and the names behind any button-unsubscribes.
  const withSends = live.filter((r) => r.sent > 0);
  const withUnsubs = live.filter((r) => r.unsubscribed > 0).map((r) => r.id);
  const [dailyResults, replies, buttonUnsubs] = await Promise.all([
    pool(withSends, 8, (r) =>
      api.get('/campaigns/analytics/daily', { campaign_id: r.id, start_date: days[0], end_date: days[days.length - 1] }).catch(() => null)),
    recentReplies(api, liveIds).catch(() => { warnings.push('Reply list unavailable'); return null; }),
    withUnsubs.length ? unsubscribedLeads(api, withUnsubs).catch(() => null) : Promise.resolve([]),
  ]);

  const byDate = new Map(days.map((d) => [d, { date: d, sent: 0, replies: 0 }]));
  let dailyMissing = 0;
  dailyResults.forEach((res) => {
    if (!Array.isArray(res)) { dailyMissing++; return; }
    for (const d of res) {
      const slot = byDate.get(String(d.date || '').slice(0, 10));
      if (!slot) continue;
      slot.sent += num(d.sent);
      slot.replies += num(d.unique_replies ?? d.replies);
    }
  });
  if (dailyMissing) warnings.push(`Daily chart is missing ${dailyMissing} ${dailyMissing === 1 ? 'campaign' : 'campaigns'}`);

  // Opt-outs: Instantly's own unsubscribes + businesses that asked by reply
  const optouts = [];
  const seen = new Set();
  for (const u of Array.isArray(buttonUnsubs) ? buttonUnsubs : []) {
    const k = u.email.toLowerCase(); if (!k || seen.has(k)) continue; seen.add(k); optouts.push(u);
  }
  for (const b of Array.isArray(blockRaw) ? blockRaw : []) {
    const k = String(b.bl_value || '').toLowerCase(); if (!k || seen.has(k)) continue; seen.add(k);
    optouts.push({ email: String(b.bl_value || ''), when: b.timestamp_created || null, source: 'list' });
  }
  let unsubReply = 0;
  for (const r of Array.isArray(replies) ? replies : []) {
    if (r.kind !== 'optout') continue;
    const k = r.email.toLowerCase(); if (!k || seen.has(k)) continue; seen.add(k);
    optouts.push({ email: r.email, when: r.when, source: 'reply' });
    unsubReply++;
  }
  optouts.sort((a, b) => Date.parse(b.when || 0) - Date.parse(a.when || 0));

  // Totals across every non-test campaign, combined
  const sum = (k) => live.reduce((n, r) => n + num(r[k]), 0);
  const unsubButton = sum('unsubscribed');
  const totals = {
    leads: sum('leads'),
    contacted: sum('contacted'),
    sent: sum('sent'),
    sent_today: null, // filled below from the inbox counts
    replies: sum('replies'),
    replies_auto: sum('replies_auto'),
    bounced: sum('bounced'),
    unsub_button: unsubButton,
    unsub_reply: unsubReply,
    unsubscribed: unsubButton + unsubReply,
  };

  // Inboxes
  const accounts = new Map((Array.isArray(accountsRaw) ? accountsRaw : []).map((a) => [String(a.email || '').toLowerCase(), a]));
  let sentTodayTotal = 0;
  const inboxes = INBOXES.map((email, i) => {
    const a = accounts.get(email.toLowerCase());
    const short = email.split('@')[0] + '@';
    if (!a) return { email, short, found: false, level: 'crit', status_label: 'Not found' };
    const hits = todayByInbox[i];
    let mine = 0;
    if (Array.isArray(hits)) for (const h of hits) if (h.campaign_id && liveIds.has(h.campaign_id)) mine++;
    sentTodayTotal += mine;
    const { level, note } = inboxLevel(a);
    return {
      email,
      short,
      found: true,
      status_label: ACCOUNT_STATUS[a.status] || `Status ${a.status}`,
      warmup_score: a.stat_warmup_score ?? null,
      daily_limit: num(a.daily_limit) || null,
      sends_today: Array.isArray(hits) ? mine : null,
      level,
      note,
    };
  });
  totals.sent_today = todayByInbox.every((h) => Array.isArray(h)) ? sentTodayTotal : null;

  return {
    ok: true,
    as_of: now.toISOString(),
    fetched_ms: Date.now() - started,
    today_pt: todayPT,
    end_date: END_DATE,
    end_label: END_LABEL,
    days_left: daysBetween(todayPT, END_DATE),
    totals,
    inboxes,
    daily: days.map((d) => byDate.get(d)),
    replies: (Array.isArray(replies) ? replies : []).slice(0, 25),
    replies_available: Array.isArray(replies),
    optouts,
    campaign_count: live.length,
    excluded_tests: tests.length,
    warnings,
    stale_since: null,
    error: null,
  };
}

async function getPayload(force) {
  const key = process.env.INSTANTLY_KEY;
  if (!key) throw new Error('INSTANTLY_KEY is not set on this site');
  const now = Date.now();
  if (cache && now - cache.at < (force ? REFRESH_MIN_MS : CACHE_MS)) return { ...cache.payload, cache: 'cached' };
  if (!inflight) inflight = build(key).finally(() => { inflight = null; });
  try {
    const payload = await inflight;
    cache = { at: Date.now(), payload };
    return { ...payload, cache: 'fresh' };
  } catch (e) {
    if (cache) return { ...cache.payload, cache: 'stale', stale_since: cache.payload.as_of, error: String(e?.message || e) };
    throw e;
  }
}

// ---- handler --------------------------------------------------------------------
export default async (req) => {
  const url = new URL(req.url);
  const m = url.pathname.match(/^\/board\/([^/]+)\/?([^/]*)\/?$/);
  if (!m || !slugOk(m[1])) return notFound();
  if (req.method !== 'GET' && req.method !== 'HEAD') return notFound();

  const sub = m[2] || '';
  if (sub === '') return html(PAGE, 200, { 'content-security-policy': CSP });
  if (sub !== 'data') return notFound();

  try {
    const payload = await getPayload(url.searchParams.get('refresh') === '1');
    return json(payload, 200);
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e), as_of: new Date().toISOString() }, 502);
  }
};

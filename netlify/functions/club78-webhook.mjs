// ============================================================================
// Grunion RFC — The '78 Club signup pipeline (Zeffy webhook receiver)
// POST /.netlify/functions/club78-webhook        ← Zeffy "payment.created"
// GET  /.netlify/functions/club78-webhook        ← status / one-time setup
// GET  …/club78-webhook?backfill=30&max=2         ← (re)process recent payments via the API
// GET  …/club78-webhook?adopt=EMAIL&since=DATE    ← bring a Chip In / pre-pipeline donor in
//      (all three require header  x-dashboard-key: <CLUB78_ADMIN_KEY env var>)
//
// What it does for every new Zeffy payment on The '78 Club membership form (and
// for top-up donations by existing members). It listens to payment.created, not
// payment.completed, so a bank transfer (ACH) is welcomed the moment it is
// initiated rather than 5-10 business days later when it settles (Josh, Sep 2 2026):
//   1. verifies the Zeffy-Signature header (HMAC-SHA256, 5-minute tolerance)
//   2. totals the donor's giving across their membership year (12 months from
//      the day they joined; Zeffy API when a key is set, else our own log)
//   3. works out the tier (Supporters' Union $350+ / Second XV $750+ /
//      Founders' XV $2,500+) and whether this is a join, an upgrade or a top-up
//   4. logs the row in the private "'78 Club Signups" sheet (idempotent —
//      the Zeffy payment id is the key, so retries finish instead of repeating)
//   5. puts the plaque name on the '78 Club Patron Wall tab of the Website
//      Sheet (which the-78-club.html reads), or moves it up a tier
//   6. sends the tier-specific welcome / upgrade / top-up email FROM
//      treasurer@sbrfc.com (Gmail API, club service account, domain-wide
//      delegation) using the templates in the sheet's "Emails" tab
//   7. sends an internal notice to treasurer@sbrfc.com
//
// Env vars (Site configuration → Environment variables, scope: Functions):
//   ZEFFY_WEBHOOK_SECRET   (required)  whsec_… from Zeffy → Settings → Integrations → Webhook
//   ZEFFY_API_KEY          (recommended) read-only Zeffy API key, same dialog
//   GA_CLIENT_EMAIL + GA_PRIVATE_KEY   the club service account (already set for
//                          the dashboard); CLUB78_CLIENT_EMAIL / CLUB78_PRIVATE_KEY
//                          override them if ever needed. The account needs
//                          domain-wide delegation in the sbrfc.com Workspace for
//                          gmail.send + spreadsheets (see CLUB78-SETUP.md).
//   CLUB78_ADMIN_KEY       (recommended) long random secret for GET status/backfill/reseed
//                          and the simulate/dry harness. Until it is set the webhook
//                          falls back to DASHBOARD_KEY, i.e. the committee passcode —
//                          which can send real mail as treasurer@ and edit the plaque, so
//                          set this one (openssl rand -hex 24) and keep it off the dashboard.
//   CLUB78_SIGNUPS_SHEET_ID (optional) overrides the private Signups sheet id below
//   CLUB78_DISABLE_EMAIL   set to "1" to log + plaque only (no emails) — for testing
//
// Zero npm dependencies (node: built-ins only) — same rule as the other functions.
// ============================================================================

import { createHmac, createSign, timingSafeEqual } from 'node:crypto';

// ---- club configuration (not secret) --------------------------------------------
const CONFIG = {
  // The '78 Club membership form in Zeffy (campaign id from the form builder URL).
  // Payments are ALSO recognised by title, so a mismatch here degrades gracefully.
  CLUB78_CAMPAIGN_ID: 'bff55e80-4c68-40d9-9f72-d769d41697b3',
  CLUB78_TITLE_RE: /78\s*club/i,
  CLUB78_FORM_URL: 'https://www.zeffy.com/en-US/ticketing/the-78-club-grunion-rfc-legacy-donors',

  // Private log + email templates (Grunion Private shared drive). The id grants nothing
  // by itself, but an env var keeps it out of the public repo if it is ever changed.
  SIGNUPS_SHEET_ID: process.env.CLUB78_SIGNUPS_SHEET_ID || '1XJpBEDfpRu8BrF8yY6BotoyUSn2xOjbyTH3GOyedX2w',
  SIGNUPS_TAB: 'Signups',
  EMAILS_TAB: 'Emails',

  // Public plaque roster (Website Sheet, tab gid 299262421 "'78 Club Patron Wall")
  WEBSITE_SHEET_ID: '1BN4ctNLbtoy1-bPNNRM3WFc2SbpmM_YYNHLmVHCU0tA',
  PATRON_WALL_GID: 299262421,

  // Who sends / who gets told
  SENDER_USER: 'treasurer@sbrfc.com',           // Gmail account the service account impersonates
  SENDER_NAME: "Josh Timpe — The '78 Club",
  NOTIFY_TO: 'treasurer@sbrfc.com',

  // Tiers, highest first. Amounts in cents. "advantage" = fair-market value of the
  // benefits (Josh, Aug 31 2026: $25 / $50 / $100), used in the acknowledgment text.
  TIERS: [
    { key: 'founders',   name: "Founders' XV",     min: 250000, advantage: 10000 },
    { key: 'second',     name: 'Second XV',        min: 75000,  advantage: 5000 },
    { key: 'supporters', name: "Supporters' Union", min: 35000,  advantage: 2500 },
  ],

  // Which Zeffy campaigns count toward a member's yearly total. The '78 form always
  // does; plain donation forms (Chip In) count as top-ups for people who already
  // joined through the '78 form. Events / shop / raffles never count.
  TOPUP_CATEGORIES: ['donation', 'membership'],

  SIGNATURE_TOLERANCE_S: 5 * 60,
  BUDGET_MS: 9000,           // overall budget per run; stays under Netlify's 10 s function limit
  STUCK_SENDING_MS: 15 * 60 * 1000, // a "sending…" marker older than this is reported by GET status
  ORG_NAME: 'Santa Barbara Rugby Football Club',
  EIN: '93-4659131',
  SITE_78: 'https://grunionrugby.com/the-78-club',
};

const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/spreadsheets';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const GMAIL_SEND = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const ZEFFY_API = 'https://api.zeffy.com/api/v1';

const SIGNUP_HEADERS = [
  'logged_at', 'payment_id', 'event_id', 'email', 'first_name', 'last_name', 'amount_usd',
  'campaign', 'rate', 'year_start', 'year_total_usd', 'tier_before', 'tier_after', 'action',
  'plaque_name', 'plaque', 'email_status', 'notify', 'kit', 'contact_id', 'receipt_url', 'notes', 'questions_json',
];
// column letters for the status cells we update after the first write
const COL = Object.fromEntries(SIGNUP_HEADERS.map((h, i) => [i, String.fromCharCode(65 + i)]));
const IDX = {
  payment_id: 1, email: 3, year_start: 9, tier_after: 12, action: 13, plaque_name: 14,
  plaque: 15, email_status: 16, notify: 17, notes: 21,
};

// ---- small helpers ----------------------------------------------------------------
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const usd = (cents) => {
  const n = Math.round(Number(cents) || 0) / 100;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
};
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });
const lower = (s) => String(s || '').trim().toLowerCase();
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const tierByKey = (k) => CONFIG.TIERS.find((t) => t.key === k) || null;
const normKey = (s) => lower(s).replace(/[^a-z0-9]/g, '');
const tierByName = (n) => CONFIG.TIERS.find((t) => normKey(t.name) === normKey(n)) || null;
const tierRank = (k) => { const i = CONFIG.TIERS.findIndex((t) => t.key === k); return i < 0 ? -1 : CONFIG.TIERS.length - i; };
const tierFor = (cents) => CONFIG.TIERS.find((t) => cents >= t.min) || null;
const nextTierAbove = (cents) => [...CONFIG.TIERS].reverse().find((t) => t.min > cents) || null;

// Admin gate for GET status / backfill / reseed and the simulate + dry harness. Uses
// CLUB78_ADMIN_KEY; falls back to the committee's DASHBOARD_KEY only while the admin
// key is unset, so nothing breaks before Josh adds it (and stops accepting the
// dashboard passcode the moment he does).
function gate(req) {
  const expected = process.env.CLUB78_ADMIN_KEY || process.env.DASHBOARD_KEY;
  if (!expected) return false;
  const got = req.headers.get('x-dashboard-key') || '';
  const a = Buffer.from(String(got)), b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---- Zeffy signature -------------------------------------------------------------------
export function verifyZeffySignature(rawBody, header, secret, nowS = Date.now() / 1000) {
  if (!secret || !header) return { ok: false, why: !secret ? 'no secret configured' : 'no Zeffy-Signature header' };
  const parts = Object.fromEntries(String(header).split(',').map((p) => p.trim().split('=')));
  const t = Number(parts.t);
  if (!Number.isFinite(t)) return { ok: false, why: 'bad timestamp' };
  if (Math.abs(nowS - t) > CONFIG.SIGNATURE_TOLERANCE_S) return { ok: false, why: 'timestamp outside tolerance' };
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest();
  let received;
  try { received = Buffer.from(String(parts.v1 || ''), 'hex'); } catch { return { ok: false, why: 'bad v1' }; }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return { ok: false, why: 'signature mismatch' };
  return { ok: true };
}

// ---- Google (service account + domain-wide delegation) -----------------------------
function googleCreds() {
  for (const raw of [process.env.CLUB78_SERVICE_ACCOUNT_JSON, process.env.GA_SERVICE_ACCOUNT_JSON]) {
    if (!raw) continue;
    try { const j = JSON.parse(raw); if (j.client_email && j.private_key) return { email: j.client_email, key: j.private_key }; } catch {}
  }
  const email = process.env.CLUB78_CLIENT_EMAIL || process.env.GA_CLIENT_EMAIL;
  const key = String(process.env.CLUB78_PRIVATE_KEY || process.env.GA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return email && key ? { email, key } : null;
}

async function googleToken(creds, sub, ms = 6000, scopes = GOOGLE_SCOPES) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: creds.email, ...(sub ? { sub } : {}), scope: scopes, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const sig = b64url(signer.sign(creds.key));
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${sig}` }),
    signal: AbortSignal.timeout(ms),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    if (data.error === 'unauthorized_client') throw new Error(`Google has not granted the service account access to ${sub} for gmail.send + spreadsheets yet (domain-wide delegation in the sbrfc.com admin console)`);
    throw new Error(`Google would not issue a token for ${sub}: ${data.error_description || data.error || r.status}`);
  }
  return data.access_token;
}

// Delegated (acts as treasurer@: Sheets + Gmail send) when the sbrfc.com admin console
// has authorised the service account; otherwise the plain service-account token, which
// can still edit any sheet shared with it but cannot send mail. The pipeline degrades to
// "log + plaque, emails pending" in that second mode and sends the pending emails on the
// next run (or a backfill) once delegation is live.
async function googleAuth(creds) {
  try {
    return { token: await googleToken(creds, CONFIG.SENDER_USER), mode: 'delegated', canEmail: true };
  } catch (e) {
    // Only a missing delegation grant degrades to log-and-plaque mode. Anything else
    // (a timeout, a Google 5xx, a bad key) must fail the run so Zeffy retries later;
    // otherwise the donor's email is parked as "pending" behind a 200 nobody sees.
    if (!/has not granted|unauthorized_client/i.test(String(e?.message || ''))) throw e;
    const token = await googleToken(creds, null, 6000, 'https://www.googleapis.com/auth/spreadsheets');
    return { token, mode: 'service-account', canEmail: false, delegationError: e.message };
  }
}

// Google API client. `deadline` (ms epoch) caps every call so a slow run fails with a
// clear error (→ non-2xx → Zeffy retries) instead of being killed mid-flight by the
// platform. Each call gets what is left of the budget, never more than 7 s.
function gapi(token, deadline = Date.now() + CONFIG.BUDGET_MS) {
  const call = async (url, init = {}) => {
    const left = deadline - Date.now();
    if (left < 400) throw Object.assign(new Error(`out of time before ${init.method || 'GET'} ${url.split('?')[0].replace(SHEETS_API, 'sheets')} (budget ${CONFIG.BUDGET_MS} ms)`), { code: 'BUDGET' });
    const r = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(Math.min(7000, left)),
    });
    const text = await r.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok) throw new Error(`Google API ${r.status} ${url.split('?')[0].replace(SHEETS_API, 'sheets')}: ${data?.error?.message || text.slice(0, 200)}`);
    return data;
  };
  const q = (s) => encodeURIComponent(s);
  return {
    meta: (id) => call(`${SHEETS_API}/${id}?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`),
    get: (id, range) => call(`${SHEETS_API}/${id}/values/${q(range)}?valueRenderOption=UNFORMATTED_VALUE`),
    append: (id, range, rows) => call(`${SHEETS_API}/${id}/values/${q(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: rows }) }),
    update: (id, range, rows) => call(`${SHEETS_API}/${id}/values/${q(range)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: rows }) }),
    batch: (id, requests) => call(`${SHEETS_API}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) }),
    send: (raw) => call(GMAIL_SEND, { method: 'POST', body: JSON.stringify({ raw }) }),
  };
}

// Make sure the Signups + Emails tabs exist (creating them, with headers / default
// templates, on first run). Returns the templates map.
async function ensureSheets(g) {
  const meta = await g.meta(CONFIG.SIGNUPS_SHEET_ID);
  const titles = new Set((meta.sheets || []).map((s) => s.properties.title));
  const requests = [];
  if (!titles.has(CONFIG.SIGNUPS_TAB)) requests.push({ addSheet: { properties: { title: CONFIG.SIGNUPS_TAB, gridProperties: { frozenRowCount: 1 } } } });
  if (!titles.has(CONFIG.EMAILS_TAB)) requests.push({ addSheet: { properties: { title: CONFIG.EMAILS_TAB } } });
  if (requests.length) await g.batch(CONFIG.SIGNUPS_SHEET_ID, requests);
  if (!titles.has(CONFIG.SIGNUPS_TAB)) await g.update(CONFIG.SIGNUPS_SHEET_ID, `${CONFIG.SIGNUPS_TAB}!A1`, [SIGNUP_HEADERS]);

  let templates = {};
  // A failed read must THROW here (Zeffy retries on a non-2xx). Treating a timeout/429 as an
  // empty tab would silently re-seed the live Emails tab and discard hand-edited copy.
  const existing = titles.has(CONFIG.EMAILS_TAB) ? await g.get(CONFIG.SIGNUPS_SHEET_ID, `${CONFIG.EMAILS_TAB}!A1:C200`) : { values: [] };
  const rows = existing.values || [];
  if (rows.length < 2) {
    const seed = [['key', 'subject', 'body — edit freely; placeholders in {{double braces}} are filled in per donor (see the notes row)'], ...DEFAULT_TEMPLATES.map((t) => [t.key, t.subject, t.body])];
    await g.update(CONFIG.SIGNUPS_SHEET_ID, `${CONFIG.EMAILS_TAB}!A1`, seed);
    templates = Object.fromEntries(DEFAULT_TEMPLATES.map((t) => [t.key, { subject: t.subject, body: t.body }]));
  } else {
    for (const r of rows.slice(1)) if (r[0]) templates[lower(r[0])] = { subject: String(r[1] || ''), body: String(r[2] || '') };
  }
  return templates;
}

// ---- Zeffy API (read-only) -----------------------------------------------------------
async function zeffyList(path, params = {}) {
  const key = process.env.ZEFFY_API_KEY;
  if (!key) return null;
  const out = [];
  let cursor;
  for (let page = 0; page < 5; page++) {
    const u = new URL(`${ZEFFY_API}${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('starting_after', cursor);
    const r = await fetch(u, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Zeffy API ${r.status}: ${data?.error?.message || 'request failed'}`);
    const items = data.data || data.items || data.payments || data.campaigns || [];
    out.push(...items);
    if (!data.has_more || !items.length) break;
    cursor = data.next_cursor || items[items.length - 1].id;
  }
  return out;
}

async function rateTitles(campaignId) {
  const key = process.env.ZEFFY_API_KEY;
  if (!key || !campaignId) return {};
  const r = await fetch(`${ZEFFY_API}/campaigns/${campaignId}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
  const c = await r.json().catch(() => ({}));
  if (!r.ok) return {};
  return Object.fromEntries((c.rates || []).map((x) => [x.id, x.title]));
}

// ---- payment interpretation -------------------------------------------------------------
function isClub78(p) {
  return lower(p.campaign_id) === lower(CONFIG.CLUB78_CAMPAIGN_ID) || CONFIG.CLUB78_TITLE_RE.test(String(p.description || ''));
}
function isTopupEligible(p) { return CONFIG.TOPUP_CATEGORIES.includes(lower(p.campaign_category)); }
function paymentOk(p) {
  const s = lower(p.status);
  // A bank transfer (ACH) arrives as "pending" / "processing" and settles 5-10 business
  // days later. Josh's call (Sep 2 2026): welcome the donor straight away — email,
  // acknowledgment and plaque row — rather than wait for settlement. So only payments
  // that are definitely NOT money are rejected here. If a transfer later bounces, Zeffy
  // emails the org; fix the sheet and the plaque by hand (there is no refund webhook).
  if (/(fail|refund|cancel|dispute|abandon|void)/.test(s)) return false;
  if (p.refund_status && lower(p.refund_status) !== 'none') return false;
  return true;
}
function amountOf(p) { return Math.round(Number(p.amount) || 0); }
function createdMs(p) { const c = Number(p.created); return c ? (c > 1e12 ? c : c * 1000) : Date.now(); }

// answers: buyer_questions[] + items[].questions[] → { plaque, polo, jersey_size, jersey_name, all: [...] }
function answersOf(p) {
  const all = [];
  for (const qa of p.buyer_questions || []) all.push(qa);
  for (const it of p.items || []) for (const qa of it.questions || []) all.push(qa);
  const find = (re) => { const hit = all.find((qa) => re.test(String(qa.question || ''))); return hit ? clean(Array.isArray(hit.answer) ? hit.answer.join(', ') : hit.answer) : ''; };
  return {
    plaque: find(/plaque/i),
    polo: find(/polo/i),
    jersey_size: find(/jersey\s*size/i),
    jersey_name: find(/name and number|jersey.*(name|number)/i),
    all,
  };
}
function kitLines(a) {
  const lines = [];
  if (a.polo) lines.push(`Polo size: ${a.polo}`);
  if (a.jersey_size) lines.push(`Jersey size: ${a.jersey_size}`);
  if (a.jersey_name) lines.push(`Jersey name & number: ${a.jersey_name}`);
  return lines.join('\n');
}

// Membership-year maths. `payments` = this donor's qualifying payments (any order).
// Years start at the first payment and roll over at the first payment on or after the
// same calendar date a year later (calendar maths, so a year that crosses Feb 29 is
// still a full year). Returns the year containing `current`.
export const yearAfter = (ms) => { const d = new Date(ms); d.setUTCFullYear(d.getUTCFullYear() + 1); return d.getTime(); };
export function membershipYear(payments, current) {
  const all = [...payments.filter((p) => p.id !== current.id), current].sort((a, b) => createdMs(a) - createdMs(b));
  let start = null, total = 0, inYear = [];
  for (const p of all) {
    const t = createdMs(p);
    if (start === null || t >= yearAfter(start)) { start = t; total = 0; inYear = []; }
    total += amountOf(p); inYear.push(p);
    if (p.id === current.id) break;
  }
  return { start, end: yearAfter(start), total, payments: inYear, totalBefore: total - amountOf(current) };
}

// ---- templates -----------------------------------------------------------------------
function render(tpl, vars) {
  return String(tpl || '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => (vars[k] ?? '')).replace(/\n{3,}/g, '\n\n').trim();
}
function ackText(v) {
  const base = `For your records: ${CONFIG.ORG_NAME}, a 501(c)(3) nonprofit (Tax ID ${CONFIG.EIN}), received your gift of ${v.amount} on ${v.date}.`;
  if (v.advantage_cents > 0) {
    return `${base} In return you receive '78 Club membership benefits with an estimated fair market value of ${v.advantage}; the remaining ${v.deductible} may be tax-deductible to the extent allowed by law. Please keep this email with your tax records and consult your tax adviser.`;
  }
  return `${base} No goods or services were provided in exchange for this gift, so the full amount may be tax-deductible to the extent allowed by law. Please keep this email with your tax records and consult your tax adviser.`;
}

// ---- plain text → simple club-styled HTML -------------------------------------------
// The templates in the Emails tab stay PLAIN TEXT — Josh edits them there without any
// markup. This turns that text into a restrained HTML email at send time: navy header
// band, gold rules, real bullets, the tax acknowledgment set apart in its own box.
// Every message goes out multipart/alternative, so plain-text clients see the original.
const GOLD = '#c2922e', NAVY = '#14202b', CREAM = '#f4f1ea', INK = '#22303c', MUTED = '#6b7885';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function linkify(s) {
  return s
    .replace(/(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/g, `<a href="$1" style="color:${GOLD};text-decoration:underline;">$1</a>`)
    .replace(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b(?![^<]*<\/a>)/g, `<a href="mailto:$1" style="color:${GOLD};text-decoration:underline;">$1</a>`);
}
const inline = (s) => linkify(escHtml(s));

function htmlFromText(text, { tier } = {}) {
  const blocks = String(text).trim().split(/\n\s*\n/);
  const parts = [];
  for (const raw of blocks) {
    const block = raw.replace(/\s+$/, '');
    if (!block.trim()) continue;
    const lines = block.split('\n');

    // the tax acknowledgment — set apart, quieter, boxed
    if (/^For your records:/.test(block.trim())) {
      parts.push(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;"><tr>` +
        `<td style="background:${CREAM};border-left:3px solid ${GOLD};padding:14px 18px;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTED};">` +
        inline(block.replace(/\n/g, ' ')) + `</td></tr></table>`);
      continue;
    }
    // the sign-off block
    if (/Faithfully submitted,|Forever Grunion,/.test(block)) {
      parts.push(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;"><tr>` +
        `<td style="border-top:1px solid #ddd7c8;padding-top:16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">` +
        lines.map(inline).join('<br />') + `</td></tr></table>`);
      continue;
    }
    // the "Mer!" shout
    if (/^Mer!?$/i.test(block.trim())) {
      parts.push(`<p style="margin:22px 0 0;font-family:${FONT};font-size:16px;font-weight:700;letter-spacing:.08em;color:${GOLD};">` +
        escHtml(block.trim()) + `</p>`);
      continue;
    }

    // mixed paragraph / bullet block
    let html = '', ul = false;
    const closeUl = () => { if (ul) { html += '</ul>'; ul = false; } };
    for (const line of lines) {
      if (/^\s*•\s?/.test(line)) {
        if (!ul) { html += `<ul style="margin:10px 0 0;padding-left:20px;">`; ul = true; }
        html += `<li style="margin:0 0 9px;font-family:${FONT};font-size:15px;line-height:1.65;color:${INK};">` +
          inline(line.replace(/^\s*•\s?/, '')) + `</li>`;
      } else if (ul && line.trim()) {
        // continuation under the last bullet (e.g. the kit details)
        html = html.replace(/<\/li>$/, `<div style="margin:6px 0 0;padding-left:2px;color:${MUTED};font-size:14px;">` +
          inline(line.trim()) + `</div></li>`);
      } else if (line.trim()) {
        closeUl();
        html += `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${INK};">` +
          inline(line) + `</p>`;
      }
    }
    closeUl();
    parts.push(html);
  }

  const kicker = tier
    ? `<div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#ffffff;opacity:.75;padding-top:6px;">${escHtml(tier)}</div>`
    : '';

  return `<!doctype html><html><body style="margin:0;padding:0;background:#eeeae0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eeeae0;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #ddd7c8;">
  <tr><td style="background:${NAVY};padding:22px 28px;border-bottom:3px solid ${GOLD};">
    <div style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:.12em;color:${GOLD};">THE '78 CLUB</div>
    <div style="font-family:${FONT};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#ffffff;opacity:.6;padding-top:3px;">Grunion R.F.C. &middot; Santa Barbara &middot; Est. 1978</div>
    ${kicker}
  </td></tr>
  <tr><td style="padding:28px;">${parts.join('\n')}</td></tr>
  <tr><td style="background:${CREAM};border-top:1px solid #ddd7c8;padding:16px 28px;font-family:${FONT};font-size:11px;line-height:1.6;color:${MUTED};">
    Santa Barbara Rugby Football Club &middot; a 501(c)(3) non-profit &middot; Tax ID ${CONFIG.EIN}<br />
    <a href="${CONFIG.SITE_78}" style="color:${MUTED};text-decoration:underline;">grunionrugby.com/the-78-club</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ---- email ----------------------------------------------------------------------------
const encWord = (s) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
function buildRaw({ to, subject, text, html, replyTo, fromName }) {
  const head = [
    `From: ${encWord(fromName || CONFIG.SENDER_NAME)} <${CONFIG.SENDER_USER}>`,
    `To: ${to.replace(/^([^<]*)</, (m, n) => (n.trim() ? encWord(n.trim()) + ' <' : '<'))}`,
    `Reply-To: ${replyTo || CONFIG.SENDER_USER}`,
    `Subject: ${encWord(subject)}`,
    'MIME-Version: 1.0',
  ];
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  if (!html) {
    return b64url([...head, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text)].join('\r\n'));
  }
  const bd = `=_club78_${Date.now().toString(36)}`;
  return b64url([
    ...head,
    `Content-Type: multipart/alternative; boundary="${bd}"`, '',
    `--${bd}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text),
    `--${bd}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html),
    `--${bd}--`, '',
  ].join('\r\n'));
}

// ---- the pipeline ----------------------------------------------------------------------
async function processPayment(p, { eventId, simulate = false, dry = false, noPlaque = false, noNotify = false, asClub = false, plaqueOverride = '', deadline = Date.now() + CONFIG.BUDGET_MS }) {
  const started = Date.now();
  const notes = [];
  const email = lower(p.buyer?.email);
  const first = clean(p.buyer?.first_name), last = clean(p.buyer?.last_name);
  if (!email) return { ok: false, skipped: 'no buyer email' };
  // `asClub` (GET ?adopt): a payment made on another Zeffy form — the Chip In donation form,
  // or anything before this pipeline existed — is run as if it had come through the '78
  // form, so it creates or extends a membership instead of being ignored.
  const club = asClub || isClub78(p);
  if (asClub && !isClub78(p)) notes.push(`adopted into the '78 Club from "${clean(p.description || p.campaign_id || 'another form')}"`);
  const answers = answersOf(p);
  // The rate title is cosmetic (log + notice). Only look it up when the payload
  // doesn't already carry it — one network call fewer inside the time budget.
  const items = p.items || [];
  const titles = items.some((it) => it.rate_title || it.title) || !items.some((it) => it.rate_id) ? {} : await rateTitles(p.campaign_id).catch(() => ({}));
  const rateTitle = clean(items.map((it) => it.rate_title || it.title || titles[it.rate_id] || '').filter(Boolean)[0] || '');

  const creds = googleCreds();
  if (!creds) throw new Error('Google service-account credentials are not set (GA_CLIENT_EMAIL / GA_PRIVATE_KEY)');
  const auth = await googleAuth(creds);
  const g = gapi(auth.token, deadline);
  const templates = await ensureSheets(g);
  if (!auth.canEmail) notes.push('emails pending: ' + auth.delegationError);

  // ---- idempotency + our own history
  // Same rule: if the log can't be read, fail the run so Zeffy retries later. An empty log on a
  // failed read would defeat the payment-id idempotency check (duplicate rows + duplicate emails).
  const logResp = await g.get(CONFIG.SIGNUPS_SHEET_ID, `${CONFIG.SIGNUPS_TAB}!A2:W5000`);
  const logRows = logResp.values || [];
  const existingIdx = logRows.findIndex((r) => String(r[IDX.payment_id] || '') === String(p.id));
  const existing = existingIdx >= 0 ? logRows[existingIdx] : null;
  const done = (v) => { const s = String(v || ''); return !!s && !s.startsWith('error') && !s.startsWith('pending'); };
  if (existing && done(existing[IDX.email_status]) && done(existing[IDX.plaque]) && done(existing[IDX.notify])) {
    return { ok: true, duplicate: true, payment_id: p.id };
  }
  // this donor's OTHER rows (a retry of this same payment must not count as history)
  const mine = logRows.filter((r) => lower(r[IDX.email]) === email && String(r[IDX.payment_id] || '') !== String(p.id));
  const isMember = mine.length > 0;

  // Only the '78 form creates members; plain donations count as top-ups for members.
  if (!club) {
    if (!(isTopupEligible(p) && isMember)) return { ok: true, ignored: 'not a \'78 Club payment', campaign: p.description || p.campaign_id };
    notes.push('top-up via ' + (p.description || 'donation form'));
  }

  // ---- this donor's qualifying payments (Zeffy API when available, else our log)
  let history = [];
  try {
    const contactId = p.contact || p.contact_id || null;
    const list = contactId ? await zeffyList('/payments', { contact: contactId }) : null;
    // defensive: only THIS donor's payments even if the API filter were ignored
    if (list) history = list.filter((x) => paymentOk(x) && (isClub78(x) || isTopupEligible(x)) && ((contactId && x.contact === contactId) || lower(x.buyer?.email) === email));
    else history = mine.map((r) => ({ id: r[IDX.payment_id], amount: Math.round(Number(r[6]) * 100), created: Date.parse(r[9] || r[0]) / 1000 }));
  } catch (e) { notes.push('history: ' + e.message); history = mine.map((r) => ({ id: r[IDX.payment_id], amount: Math.round(Number(r[6]) * 100), created: Date.parse(r[9] || r[0]) / 1000 })); }

  const year = membershipYear(history, p);
  const before = tierFor(year.totalBefore);
  const after = tierFor(year.total);
  // the highest tier we have already told this donor about in this year
  const told = mine.filter((r) => r[IDX.year_start] === new Date(year.start).toISOString()).map((r) => tierByName(r[IDX.tier_after])?.key).filter(Boolean)
    .sort((a, b) => tierRank(b) - tierRank(a))[0] || null;
  // first time we see this donor → always a "join" (welcome), whatever Zeffy's history says
  const prevKey = isMember ? (told || before?.key || null) : null;
  const action = !after ? 'none' : (!isMember || !prevKey ? 'join' : tierRank(after.key) > tierRank(prevKey) ? 'upgrade' : 'topup');
  const advantageCents = Math.max(0, (after?.advantage || 0) - (tierByKey(prevKey)?.advantage || 0));

  // ---- plaque name (their answer, else "First Last"); "Anonymous" is allowed
  // (a top-up without a plaque answer keeps the name they gave when they joined;
  // ?adopt&plaque= overrides, e.g. to match a name already typed on the wall by hand)
  const prevPlaque = mine.map((r) => clean(r[IDX.plaque_name])).filter(Boolean).pop() || '';
  const plaqueName = clean(plaqueOverride) || clean(answers.plaque) || prevPlaque || clean(`${first} ${last}`) || email;

  const vars = {
    first_name: first || 'there', last_name: last, email,
    tier: after?.name || '', tier_before: tierByKey(prevKey)?.name || '',
    amount: usd(amountOf(p)), total: usd(year.total), date: fmtDate(createdMs(p)),
    year_end: fmtDate(year.end), plaque_name: plaqueName,
    advantage: usd(advantageCents), advantage_cents: advantageCents, deductible: usd(Math.max(0, amountOf(p) - advantageCents)),
    kit_lines: kitLines(answers), rate: rateTitle,
    next_tier_line: '', receipt_url: p.receipt_url || '', form_url: CONFIG.CLUB78_FORM_URL, site_url: CONFIG.SITE_78,
    payment_id: p.id,
  };
  const nxt = nextTierAbove(year.total);
  if (nxt) vars.next_tier_line = `You're ${usd(nxt.min - year.total)} short of ${nxt.name} — anything else you give before ${vars.year_end} counts toward it.`;
  vars.ack = ackText(vars);

  // ---- log row (write first so a crash later can be resumed on Zeffy's retry)
  const row = [
    new Date().toISOString(), p.id, eventId || '', email, first, last, (amountOf(p) / 100).toFixed(2),
    clean(p.description || p.campaign_id || ''), rateTitle, new Date(year.start).toISOString(), (year.total / 100).toFixed(2),
    tierByKey(prevKey)?.name || '', after?.name || '', action, plaqueName, '', '', '', kitLines(answers).replace(/\n/g, ' · '),
    p.contact || '', p.receipt_url || '', notes.join(' | '), JSON.stringify(answers.all).slice(0, 4000),
  ];
  let rowNumber;
  if (existing) {
    rowNumber = existingIdx + 2;
    await g.update(CONFIG.SIGNUPS_SHEET_ID, `${CONFIG.SIGNUPS_TAB}!A${rowNumber}:W${rowNumber}`, [row.map((v, i) => (i >= 15 && i <= 17 ? existing[i] || '' : v))]);
  } else {
    const res = await g.append(CONFIG.SIGNUPS_SHEET_ID, `${CONFIG.SIGNUPS_TAB}!A1:W1`, [row]);
    rowNumber = Number((res.updates?.updatedRange || '').match(/![A-Z]+(\d+)/)?.[1]) || null;
  }
  // Status cells. Best-effort by default (a failed status write must not fail a run whose
  // real work succeeded). `strict` is for the "sending…" marker, which MUST land before
  // any mail goes out; otherwise a retry could send the same email twice.
  const setCell = async (idx, value, { strict = false } = {}) => {
    if (!rowNumber) { if (strict) throw new Error('could not find the log row to mark before sending; not sending'); return; }
    const write = g.update(CONFIG.SIGNUPS_SHEET_ID, `${CONFIG.SIGNUPS_TAB}!${COL[idx]}${rowNumber}`, [[value]]);
    if (strict) await write; else await write.catch(() => {});
  };

  const result = { ok: true, dry_run: dry || undefined, payment_id: p.id, email, action, tier: after?.name || null, year_total: year.total / 100, plaque: null, email_sent: false, email_status: existing ? String(existing[IDX.email_status] || '') : '', notify_sent: false, google_mode: auth.mode, notes };
  if (action === 'none') { await setCell(IDX.notes, [...notes, 'below Supporters\' Union minimum'].join(' | ')); return result; }

  // ---- plaque (Website Sheet)
  if (dry || noPlaque) {
    result.plaque = `${dry ? 'DRY RUN' : 'SKIPPED'} — would add "${plaqueName}" to ${after.name}`;
    await setCell(IDX.plaque, 'dry run (not written)');
  } else if (!(existing && done(existing[IDX.plaque]))) {
    try {
      const status = await updatePlaque(g, { name: plaqueName, tier: after.name, previousName: prevPlaque });
      result.plaque = status; await setCell(IDX.plaque, status);
    } catch (e) { result.plaque = 'error: ' + e.message; await setCell(IDX.plaque, 'error: ' + e.message); }
  } else result.plaque = existing[IDX.plaque];

  // ---- donor email
  const emailsOff = process.env.CLUB78_DISABLE_EMAIL === '1';
  if (!(existing && done(existing[IDX.email_status]))) {
    const key = action === 'join' ? after.key : action;         // supporters | second | founders | upgrade | topup
    const tpl = templates[key] || templates[action] || null;
    if (!tpl) { await setCell(IDX.email_status, `error: no template "${key}"`); }
    else if (dry) {
      result.email_preview = { template: key, to: email, subject: render(tpl.subject, vars), body: render(tpl.body, vars) };
      await setCell(IDX.email_status, `dry run (would send "${key}")`);
    }
    else if (emailsOff) { await setCell(IDX.email_status, 'skipped (CLUB78_DISABLE_EMAIL)'); }
    else if (!auth.canEmail) { await setCell(IDX.email_status, `pending: delegation (${key})`); result.email_pending = true; }
    else {
      const bodyText = render(tpl.body, vars);
      // Mark the row BEFORE sending. If the function is killed between the send and the
      // "sent" write, the row shows "sending …" (GET status lists it after 15 min) and a
      // retry never sends a second copy. Only a definite failure (Google said no, or we
      // ran out of budget before calling) is written back as an error, which a retry or
      // backfill will resend; an ambiguous one (timeout mid-request) keeps the marker.
      await setCell(IDX.email_status, `sending ${key} ${new Date().toISOString()}`, { strict: true });
      try {
        await g.send(buildRaw({ to: `${first} ${last} <${email}>`.trim(), subject: render(tpl.subject, vars), text: bodyText, html: htmlFromText(bodyText, { tier: after?.name }) }));
        result.email_sent = true; result.email_status = `sent ${key}`; await setCell(IDX.email_status, `sent ${key} ${new Date().toISOString()}`);
      } catch (e) {
        const definite = e?.code === 'BUDGET' || /^Google API \d{3}/.test(String(e?.message || ''));
        if (definite) await setCell(IDX.email_status, 'error: ' + e.message);
        result.email_status = definite ? 'error' : 'sending (unconfirmed)';
        result.notes.push('email: ' + e.message + (definite ? '' : ' (send unconfirmed; check Sent mail before clearing the cell)'));
      }
    }
  } else result.email_sent = !/^sending /.test(String(existing[IDX.email_status] || ''));

  // ---- internal notice
  if (!(existing && done(existing[IDX.notify]))) {
    const tpl = templates.notify;
    if (dry || noNotify) { await setCell(IDX.notify, dry ? 'dry run (not sent)' : 'skipped by request'); }
    else if (tpl && !emailsOff && !auth.canEmail) { await setCell(IDX.notify, 'pending: delegation'); }
    else if (tpl && !emailsOff) {
      try {
        const extra = { ...vars, kit_lines: kitLines(answers) || '(none)', action, notes: notes.join(' | ') || '(none)', sheet_url: `https://docs.google.com/spreadsheets/d/${CONFIG.SIGNUPS_SHEET_ID}` };
        await g.send(buildRaw({ to: CONFIG.NOTIFY_TO, subject: render(tpl.subject, extra), text: render(tpl.body, extra), fromName: "'78 Club bot" }));
        result.notify_sent = true; await setCell(IDX.notify, `sent ${new Date().toISOString()}`);
      } catch (e) { await setCell(IDX.notify, 'error: ' + e.message); result.notes.push('notify: ' + e.message); }
    } else await setCell(IDX.notify, emailsOff ? 'skipped' : 'error: no notify template');
  } else result.notify_sent = true;

  result.ms = Date.now() - started;
  return result;
}

// Patron Wall: Tier | Name rows. Move an existing name up a tier, else append.
async function updatePlaque(g, { name, tier, previousName }) {
  const meta = await g.meta(CONFIG.WEBSITE_SHEET_ID);
  const sheet = (meta.sheets || []).find((s) => s.properties.sheetId === CONFIG.PATRON_WALL_GID);
  if (!sheet) throw new Error(`Patron Wall tab (gid ${CONFIG.PATRON_WALL_GID}) not found in the Website Sheet`);
  const title = sheet.properties.title;
  const data = await g.get(CONFIG.WEBSITE_SHEET_ID, `'${title.replace(/'/g, "''")}'!A1:B1000`);
  const rows = data.values || [];
  const norm = (s) => lower(s).replace(/[^a-z0-9]/g, '');
  const candidates = [name, previousName].filter(Boolean).map(norm);
  const hit = rows.findIndex((r, i) => i > 0 && candidates.includes(norm(r[1])) && norm(r[1]) !== norm('Anonymous'));
  if (hit > 0) {
    const currentRank = tierRank(tierByName(rows[hit][0])?.key);
    const newRank = tierRank(tierByName(tier)?.key);
    // never move a name DOWN a tier (a second donor picking the same plaque text, or a
    // re-run) — only up, or a rename at the same level
    if (newRank < currentRank) return `already listed under ${rows[hit][0]} (kept)`;
    if (newRank === currentRank && norm(rows[hit][1]) === norm(name)) return 'already listed';
    await g.update(CONFIG.WEBSITE_SHEET_ID, `'${title.replace(/'/g, "''")}'!A${hit + 1}:B${hit + 1}`, [[tier, name]]);
    return newRank > currentRank ? `moved to ${tier} (row ${hit + 1})` : `renamed to ${name} (row ${hit + 1})`;
  }
  await g.append(CONFIG.WEBSITE_SHEET_ID, `'${title.replace(/'/g, "''")}'!A1:B1`, [[tier, name]]);
  return `added to ${tier}`;
}

// ---- default email templates (seeded into the Emails tab on first run; edit them THERE)
// ---- default email templates ---------------------------------------------------------
// Josh's copy (Update.docx, Sep 1 2026). These are the SEED only — the live copy lives in
// the Emails tab of the '78 Club Signups sheet and is edited there, no deploy needed.
// GET ?reseed=1 overwrites that tab from these (destructive — see CLUB78-SETUP.md).
const DEFAULT_TEMPLATES = [
  {
    key: 'supporters',
    subject: "Welcome to The '78 Club, {{first_name}} \u2014 Supporters' Union",
    body: `Hi {{first_name}},

Welcome to the club! Your gift of {{amount}} makes you a Supporters' Union member of The '78 Club for the year ahead (through {{year_end}}). As a member you are one of the stalwarts, olde boys and stubborn friends keeping Grunion rugby competitive.

Here's what that means:
• Your '78 Club pin and custom season mug, which gives you half-off beers at every home game.
• Exclusive sideline seating at all home matches, come find the '78 Club tent.
• Your name on the '78 Club plaque on the wall of the clubhouse and at {{site_url}}, it will read "{{plaque_name}}" under Supporters' Union. If you'd rather have your donation anonymous, in memory of someone, or under a nickname just let me know and I'll fix it.
• A vote toward the '78 Club representative on the Grunion board.

We'll hand over the pin & mug at the next home match, or tell me where to send them.

{{next_tier_line}}

{{ack}}

Thank you for showing up after the whistle and being a part of what makes this club so great.

Mer!

Faithfully submitted,
Josh Timpe (Stretch), Treasurer SBRFC
treasurer@sbrfc.com`,
  },
  {
    key: 'second',
    subject: "Welcome to The '78 Club, {{first_name}} \u2014 Second XV",
    body: `Hi {{first_name}},

Welcome to the club! Your gift of {{amount}} makes you a Second XV member of The '78 Club for the year ahead (through {{year_end}}). As a member you are one of the stalwarts, olde boys and stubborn friends keeping Grunion rugby competitive.

Here's what that means:
• Your '78 Club polo and club training gear, the kit details you gave us are:
{{kit_lines}}
• Your '78 Club pin and custom season mug, half-off beers at every home game.
• Exclusive sideline seating at all home matches, come find the '78 Club tent.
• Your name on the '78 Club plaque, on the wall of the clubhouse and at {{site_url}}, it will read "{{plaque_name}}" under Second XV. If you'd rather have your donation anonymous, in memory of someone, or under a nickname just let me know and I'll fix it.
• A vote toward the '78 Club representative on the Grunion board.

We'll hand over the pin, mug, polo, and merch at the next home match, or tell me where to send them.

{{next_tier_line}}

{{ack}}

Thank you for showing up after the whistle and being a part of what makes this club so great.

Mer!

Faithfully submitted,
Josh Timpe (Stretch), Treasurer SBRFC
treasurer@sbrfc.com`,
  },
  {
    key: 'founders',
    subject: "Welcome to the Founders' XV, {{first_name}}",
    body: `Hi {{first_name}},

Welcome to the Founders' XV. Your gift of {{amount}} puts you in the top tier of The '78 Club, and permanently on the Founders' XV plaque. As a member you are one of the stalwarts, olde boys and stubborn friends keeping Grunion rugby competitive.

Here's what that means:
• Your Founders' XV jersey with your name and number, the details you gave us are:
{{kit_lines}}
• Permanent placement on the Founders' XV plaque, in the clubhouse and at {{site_url}}, it will read "{{plaque_name}}". If you'd rather have your donation anonymous, in memory of someone, or under a nickname just let me know and I'll fix it.
• Your custom season mug earning you free beers at every home game, plus the '78 Club pin and polo.
• Exclusive sideline seating at all home matches, come find the '78 Club tent.
• An invitation to the annual Founders' XV get-together.
• A vote toward the '78 Club representative on the Grunion board.

I'll be in touch about the jersey and the get-together. The pin, mug and polo are yours at the next home match, or tell me where to send them.

{{ack}}

This is the roll call the club was built on. Thank you for taking your place in it.

Mer!

Faithfully submitted,
Josh Timpe (Stretch), Treasurer SBRFC
treasurer@sbrfc.com`,
  },
  {
    key: 'upgrade',
    subject: "You've moved up \u2014 {{tier}}, The '78 Club",
    body: `Hi {{first_name}},

Your gift of {{amount}} brings your '78 Club total for the year to {{total}}, which moves you up from {{tier_before}} to {{tier}}. Your name on the plaque moves with you.

{{kit_lines}}

I'll reach out about the extra kit that comes with {{tier}}. If you'd like the plaque to read differently from "{{plaque_name}}", just reply.

{{next_tier_line}}

{{ack}}

Thank you for keeping the club stronger than you found it.

Mer!

Faithfully submitted,
Josh Timpe (Stretch), Treasurer SBRFC
treasurer@sbrfc.com`,
  },
  {
    key: 'topup',
    subject: "Thank you, {{first_name}} \u2014 '78 Club total now {{total}}",
    body: `Hi {{first_name}},

Thank you for the extra {{amount}}. That brings your '78 Club total for the membership year to {{total}} ({{tier}}).

{{next_tier_line}}

{{ack}}

Mer!

Faithfully submitted,
Josh Timpe (Stretch), Treasurer SBRFC
treasurer@sbrfc.com`,
  },
  {
    key: 'notify',
    subject: "'78 Club: {{action}} \u2014 {{first_name}} {{last_name}} \u2014 {{tier}} ({{amount}})",
    body: `New '78 Club activity.

Donor: {{first_name}} {{last_name}} <{{email}}>
Action: {{action}}
Tier: {{tier}} (was: {{tier_before}})
This payment: {{amount}} on {{date}}
Membership-year total: {{total}} (year ends {{year_end}})
Plaque name: {{plaque_name}}
Rate chosen on the form: {{rate}}

Kit:
{{kit_lines}}

Notes: {{notes}}
Zeffy receipt: {{receipt_url}}
Payment id: {{payment_id}}
Log: {{sheet_url}}`,
  },
];

// ---- adopt: bring a donor who gave on ANOTHER Zeffy form into the '78 Club ---------------
// GET ?adopt=EMAIL&since=YYYY-MM-DD[&max=N][&plaque=NAME][&list=1]   (admin key required)
// For people who gave before this pipeline existed, or on the general Chip In donation
// form instead of the '78 form (Dan Freedman, $400 on Aug 27 2026). Their REAL payments
// since `since` are read from the Zeffy API and run through the normal pipeline as '78
// Club payments: the first becomes a join (welcome email, plaque, notice), later ones
// upgrades / top-ups. Because the log rows carry the real Zeffy payment ids and contact,
// a later '78-form gift finds these in the donor's history and counts them once — never
// twice. Idempotent: a second run answers duplicate: true. `list=1` only reports what
// would be adopted and writes nothing. `plaque=` fixes the plaque name (e.g. to match a
// name already typed on the wall by hand) instead of "First Last" from Zeffy.
async function adoptDonor(url, deadline, started) {
  const email = lower(url.searchParams.get('adopt'));
  const sinceMs = Date.parse(url.searchParams.get('since') || '');
  const max = Math.min(10, Math.max(1, Number(url.searchParams.get('max')) || 2));
  const plaque = clean(url.searchParams.get('plaque') || '');
  const listOnly = url.searchParams.get('list') === '1';
  const out = { email, since: Number.isFinite(sinceMs) ? new Date(sinceMs).toISOString() : null, list_only: listOnly || undefined, found: 0, skipped: [], processed: [], remaining: 0 };
  if (!process.env.ZEFFY_API_KEY) return { ...out, error: 'ZEFFY_API_KEY is not set — adopt needs the API' };
  if (!email.includes('@') || !Number.isFinite(sinceMs)) return { ...out, error: 'usage: ?adopt=EMAIL&since=YYYY-MM-DD' };
  const all = (await zeffyList('/payments', { 'created[gte]': Math.floor(sinceMs / 1000) })) || [];
  // only THIS donor, only since the date — whatever the API did with the filter
  const theirs = all.filter((p) => lower(p.buyer?.email) === email && createdMs(p) >= sinceMs).sort((a, b) => createdMs(a) - createdMs(b));
  const brief = (p) => ({ payment_id: p.id, amount: usd(amountOf(p)), date: fmtDate(createdMs(p)), form: clean(p.description || p.campaign_id || ''), category: p.campaign_category || '', status: p.status || '', contact: p.contact || p.contact_id || null });
  const todo = [];
  for (const p of theirs) {
    if (!paymentOk(p)) out.skipped.push({ ...brief(p), why: `status ${p.status} / refund ${p.refund_status}` });
    else if (!(isClub78(p) || isTopupEligible(p))) out.skipped.push({ ...brief(p), why: `${p.campaign_category || 'this kind of'} payments never count (events, shop, raffles)` });
    else todo.push(p);
  }
  out.found = todo.length;
  if (listOnly) {
    out.would_adopt = todo.map(brief);
    // What the pipeline will count: EVERY qualifying gift on this donor's Zeffy contact, even
    // before `since` (the membership year starts at the earliest one — same rule as everyone).
    const contactId = todo[0]?.contact || todo[0]?.contact_id || null;
    const hist = contactId ? (await zeffyList('/payments', { contact: contactId })) || [] : [];
    out.history = hist.filter((x) => paymentOk(x) && (isClub78(x) || isTopupEligible(x)) && (x.contact === contactId || lower(x.buyer?.email) === email))
      .sort((a, b) => createdMs(a) - createdMs(b)).map(brief);
    return out;
  }
  for (const p of todo) {
    if (out.processed.length >= max || Date.now() - started > CONFIG.BUDGET_MS - 3500) { out.remaining++; continue; }
    try {
      const r = await processPayment(p, { eventId: 'adopt', asClub: true, plaqueOverride: plaque, deadline });
      out.processed.push(r.duplicate ? { payment_id: p.id, duplicate: true } : { ...brief(p), ...r });
    } catch (e) { out.processed.push({ payment_id: p.id, error: e.message }); }
  }
  return out;
}

// ---- handler --------------------------------------------------------------------------
export default async (req) => {
  const started = Date.now();
  const deadline = started + CONFIG.BUDGET_MS;
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!gate(req)) return json({ ok: true, service: "The '78 Club webhook", hint: 'POST from Zeffy only' });
    const url0 = new URL(req.url);
    // ?adopt=EMAIL&since=YYYY-MM-DD → a Chip In / pre-pipeline donor joins the '78 Club (see
    // adoptDonor above). Runs on its own, before the status checks, so it keeps the full budget.
    if (url0.searchParams.has('adopt')) {
      try { return json({ ok: true, adopt: await adoptDonor(url0, deadline, started) }); }
      catch (e) { return json({ ok: false, adopt: { error: String(e?.message || e) } }); }
    }
    // status + one-time setup (creates the tabs and seeds the templates)
    const out = { ok: true, checks: {} };
    out.checks.webhook_secret = !!process.env.ZEFFY_WEBHOOK_SECRET;
    out.checks.zeffy_api_key = !!process.env.ZEFFY_API_KEY;
    out.checks.admin_key = process.env.CLUB78_ADMIN_KEY ? 'CLUB78_ADMIN_KEY' : 'DASHBOARD_KEY (fallback — set CLUB78_ADMIN_KEY)';
    out.checks.google_credentials = !!googleCreds();
    try {
      const auth = await googleAuth(googleCreds());
      const g = gapi(auth.token, deadline);
      out.checks.google_mode = auth.mode;
      out.checks.google_delegation = auth.canEmail;
      if (auth.delegationError) out.checks.delegation_error = auth.delegationError;
      const templates = await ensureSheets(g);
      out.checks.signups_sheet = true;
      out.checks.templates = Object.keys(templates);
      const meta = await g.meta(CONFIG.WEBSITE_SHEET_ID);
      out.checks.patron_wall_tab = (meta.sheets || []).find((s) => s.properties.sheetId === CONFIG.PATRON_WALL_GID)?.properties.title || null;
      // rows whose donor email was marked "sending …" but never confirmed "sent": the
      // function was cut off mid-send. Check treasurer@'s Sent mail; if the email is
      // not there, clear that cell in the sheet and run ?backfill to resend.
      const log = await g.get(CONFIG.SIGNUPS_SHEET_ID, `${CONFIG.SIGNUPS_TAB}!A2:W5000`);
      const stuck = (log.values || [])
        .map((r, i) => ({ row: i + 2, payment_id: r[IDX.payment_id], email: r[IDX.email], email_status: String(r[IDX.email_status] || '') }))
        .filter((x) => /^sending /.test(x.email_status) && Date.now() - (Date.parse(x.email_status.split(' ')[2] || '') || 0) > CONFIG.STUCK_SENDING_MS);
      out.checks.stuck_sending = stuck.length ? stuck : 'none';
    } catch (e) { out.checks.google_error = e.message; }
    try {
      const camps = await zeffyList('/campaigns');
      if (camps) {
        const hit = camps.find((c) => lower(c.id) === lower(CONFIG.CLUB78_CAMPAIGN_ID)) || camps.find((c) => CONFIG.CLUB78_TITLE_RE.test(c.title || ''));
        out.checks.club78_campaign = hit ? { id: hit.id, title: hit.title, matches_config_id: lower(hit.id) === lower(CONFIG.CLUB78_CAMPAIGN_ID) } : 'not found';
      }
    } catch (e) { out.checks.zeffy_api_error = e.message; }
    // ?reseed=1&confirm=reseed → overwrite the Emails tab from DEFAULT_TEMPLATES above.
    // DESTRUCTIVE: it discards whatever is in the sheet, so it needs the second parameter.
    // Only for pushing a new approved copy deck.
    if (url0.searchParams.get('reseed') === '1') {
      if (url0.searchParams.get('confirm') !== 'reseed') {
        out.reseed_error = 'reseed overwrites every template in the Emails tab; add &confirm=reseed to do it';
      } else {
        try {
          const auth = await googleAuth(googleCreds());
          const g = gapi(auth.token, deadline);
          const rows = [['key', 'subject', 'body — edit freely; placeholders in {{double braces}} are filled in per donor'],
            ...DEFAULT_TEMPLATES.map((t) => [t.key, t.subject, t.body])];
          await g.update(CONFIG.SIGNUPS_SHEET_ID, `${CONFIG.EMAILS_TAB}!A1:C${rows.length}`, rows);
          out.reseeded = DEFAULT_TEMPLATES.map((t) => t.key);
        } catch (e) { out.reseed_error = e.message; }
      }
    }

    // ?backfill=DAYS[&max=N]  → (re)process recent '78 Club payments from the Zeffy API:
    // catches anything paid while the webhook was off or the pipeline was failing, and
    // finishes rows left "pending" (e.g. emails waiting on delegation). Idempotent.
    const url = url0;
    if (url.searchParams.has('backfill')) {
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('backfill')) || 30));
      const max = Math.min(10, Math.max(1, Number(url.searchParams.get('max')) || 2));
      out.backfill = { days, processed: [], remaining: 0 };
      try {
        const since = Math.floor(Date.now() / 1000) - days * 86400;
        const list = (await zeffyList('/payments', { campaign: CONFIG.CLUB78_CAMPAIGN_ID, 'created[gte]': since })) || [];
        const todo = list.filter((p) => paymentOk(p)).sort((a, b) => createdMs(a) - createdMs(b));
        out.backfill.found = todo.length;
        for (const p of todo) {
          if (out.backfill.processed.length >= max || Date.now() - started > CONFIG.BUDGET_MS - 3500) { out.backfill.remaining++; continue; }
          try { const r = await processPayment(p, { eventId: 'backfill', deadline }); out.backfill.processed.push(r.duplicate ? { payment_id: p.id, duplicate: true } : r); }
          catch (e) { out.backfill.processed.push({ payment_id: p.id, error: e.message }); }
        }
        if (!process.env.ZEFFY_API_KEY) out.backfill.error = 'ZEFFY_API_KEY is not set — backfill needs the API';
      } catch (e) { out.backfill.error = e.message; }
    }
    return json(out);
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const raw = await req.text();
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: 'invalid JSON' }, 400); }

  // Test harness: POST {"simulate": true, "data": {...payment...}} with the dashboard key
  // bypasses the signature so the pipeline can be exercised without a real payment.
  const simulate = (event?.simulate === true || event?.dry === true) && gate(req);
  // "dry": true → walk the whole pipeline and REPORT what would happen, but write
  // nothing to the public plaque and send no mail. The Signups row is still logged
  // (marked "dry run") so the test is visible and deletable in one place.
  const dry = event?.dry === true && gate(req);
  // test-only switches (dashboard key required): keep a test run off the public plaque
  // and stop the internal notice, so the ONLY mail is the one donor email.
  const noPlaque = event?.no_plaque === true && gate(req);
  const noNotify = event?.no_notify === true && gate(req);
  if (!simulate) {
    const v = verifyZeffySignature(raw, req.headers.get('zeffy-signature') || req.headers.get('Zeffy-Signature'), process.env.ZEFFY_WEBHOOK_SECRET);
    if (!v.ok) {
      // the reason stays in the function log (Netlify UI) — anonymous callers get no detail
      console.warn(`club78-webhook: signature rejected (${v.why})`);
      return json({ error: 'invalid signature' }, v.why === 'no secret configured' ? 500 : 400);
    }
  }
  // payment.created fires for every new payment whatever its status (full payment in
  // data). payment.completed — the settlement event — is deliberately ignored: if both
  // were handled, a card payment would arrive twice within a second and race itself.
  if (event?.type && event.type !== 'payment.created') return json({ ok: true, ignored: event.type });
  const p = event?.data;
  if (!p || !p.id) return json({ error: 'no payment in event' }, 400);
  if (!paymentOk(p)) return json({ ok: true, ignored: `status ${p.status} / refund ${p.refund_status}` });

  try {
    const result = await processPayment(p, { eventId: event.id, simulate, dry, noPlaque, noNotify, deadline });
    return json(result);
  } catch (e) {
    // non-2xx → Zeffy retries (up to 5×); the log row makes the retry resume, not repeat
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
};

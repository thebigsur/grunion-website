// ============================================================================
// Grunion RFC — The '78 Club signup pipeline (Zeffy webhook receiver)
// POST /.netlify/functions/club78-webhook        ← Zeffy "payment.completed"
// GET  /.netlify/functions/club78-webhook        ← status / one-time setup
// GET  …/club78-webhook?backfill=30&max=2         ← (re)process recent payments via the API
//      (both require header  x-dashboard-key: <DASHBOARD_KEY env var>)
//
// What it does for every completed Zeffy payment on The '78 Club membership
// form (and for top-up donations by existing members):
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
//   DASHBOARD_KEY          (required for GET status + the simulate/dry harness)
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

  // Private log + email templates (Grunion Private shared drive)
  SIGNUPS_SHEET_ID: '1XJpBEDfpRu8BrF8yY6BotoyUSn2xOjbyTH3GOyedX2w',
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

  MEMBERSHIP_DAYS: 365,
  SIGNATURE_TOLERANCE_S: 5 * 60,
  BUDGET_MS: 9000,
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

function gate(req) {
  const expected = process.env.DASHBOARD_KEY;
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
    const token = await googleToken(creds, null, 6000, 'https://www.googleapis.com/auth/spreadsheets');
    return { token, mode: 'service-account', canEmail: false, delegationError: e.message };
  }
}

function gapi(token) {
  const call = async (url, init = {}) => {
    const r = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(7000),
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
  const existing = titles.has(CONFIG.EMAILS_TAB) ? await g.get(CONFIG.SIGNUPS_SHEET_ID, `${CONFIG.EMAILS_TAB}!A1:C200`).catch(() => ({})) : {};
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
  if (/(fail|refund|cancel|dispute|pending|void)/.test(s)) return false;
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
// Years start at the first payment and roll over at the first payment after
// MEMBERSHIP_DAYS. Returns the year containing `current`.
export function membershipYear(payments, current) {
  const all = [...payments.filter((p) => p.id !== current.id), current].sort((a, b) => createdMs(a) - createdMs(b));
  const span = CONFIG.MEMBERSHIP_DAYS * 86400000;
  let start = null, total = 0, inYear = [];
  for (const p of all) {
    const t = createdMs(p);
    if (start === null || t >= start + span) { start = t; total = 0; inYear = []; }
    total += amountOf(p); inYear.push(p);
    if (p.id === current.id) break;
  }
  return { start, end: start + span, total, payments: inYear, totalBefore: total - amountOf(current) };
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

// ---- email ----------------------------------------------------------------------------
const encWord = (s) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
function buildRaw({ to, subject, text, replyTo, fromName }) {
  const lines = [
    `From: ${encWord(fromName || CONFIG.SENDER_NAME)} <${CONFIG.SENDER_USER}>`,
    `To: ${to.replace(/^([^<]*)</, (m, n) => (n.trim() ? encWord(n.trim()) + ' <' : '<'))}`,
    `Reply-To: ${replyTo || CONFIG.SENDER_USER}`,
    `Subject: ${encWord(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
  ];
  return b64url(lines.join('\r\n'));
}

// ---- the pipeline ----------------------------------------------------------------------
async function processPayment(p, { eventId, simulate = false, dry = false }) {
  const started = Date.now();
  const notes = [];
  const email = lower(p.buyer?.email);
  const first = clean(p.buyer?.first_name), last = clean(p.buyer?.last_name);
  if (!email) return { ok: false, skipped: 'no buyer email' };
  const club = isClub78(p);
  const answers = answersOf(p);
  const titles = await rateTitles(p.campaign_id).catch(() => ({}));
  const rateTitle = clean((p.items || []).map((it) => it.rate_title || it.title || titles[it.rate_id] || '').filter(Boolean)[0] || '');

  const creds = googleCreds();
  if (!creds) throw new Error('Google service-account credentials are not set (GA_CLIENT_EMAIL / GA_PRIVATE_KEY)');
  const auth = await googleAuth(creds);
  const g = gapi(auth.token);
  const templates = await ensureSheets(g);
  if (!auth.canEmail) notes.push('emails pending: ' + auth.delegationError);

  // ---- idempotency + our own history
  const logResp = await g.get(CONFIG.SIGNUPS_SHEET_ID, `${CONFIG.SIGNUPS_TAB}!A2:W5000`).catch(() => ({}));
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
  // (a top-up without a plaque answer keeps the name they gave when they joined)
  const prevPlaque = mine.map((r) => clean(r[IDX.plaque_name])).filter(Boolean).pop() || '';
  const plaqueName = clean(answers.plaque) || prevPlaque || clean(`${first} ${last}`) || email;

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
  const setCell = async (idx, value) => { if (rowNumber) await g.update(CONFIG.SIGNUPS_SHEET_ID, `${CONFIG.SIGNUPS_TAB}!${COL[idx]}${rowNumber}`, [[value]]).catch(() => {}); };

  const result = { ok: true, dry_run: dry || undefined, payment_id: p.id, email, action, tier: after?.name || null, year_total: year.total / 100, plaque: null, email_sent: false, notify_sent: false, google_mode: auth.mode, notes };
  if (action === 'none') { await setCell(IDX.notes, [...notes, 'below Supporters\' Union minimum'].join(' | ')); return result; }

  // ---- plaque (Website Sheet)
  if (dry) {
    result.plaque = `DRY RUN — would add "${plaqueName}" to ${after.name}`;
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
      try {
        await g.send(buildRaw({ to: `${first} ${last} <${email}>`.trim(), subject: render(tpl.subject, vars), text: render(tpl.body, vars) }));
        result.email_sent = true; await setCell(IDX.email_status, `sent ${key} ${new Date().toISOString()}`);
      } catch (e) { await setCell(IDX.email_status, 'error: ' + e.message); result.notes.push('email: ' + e.message); }
    }
  } else result.email_sent = true;

  // ---- internal notice
  if (!(existing && done(existing[IDX.notify]))) {
    const tpl = templates.notify;
    if (dry) { await setCell(IDX.notify, 'dry run (not sent)'); }
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
const SIGNOFF = 'Forever Grunion,\nJosh Timpe (Stretch), Treasurer SBRFC\ntreasurer@sbrfc.com';
const DEFAULT_TEMPLATES = [
  {
    key: 'supporters',
    subject: "Welcome to The '78 Club, {{first_name}} — Supporters' Union",
    body: `Hi {{first_name}},

You're in. Your gift of {{amount}} makes you a Supporters' Union member of The '78 Club for the year ahead (through {{year_end}}) — one of the stalwarts, olde boys and stubborn friends keeping Grunion rugby competitive.

Here's what that means:
• Your '78 Club pin and custom season mug — half-off beers at every home game. We'll get them to you at the next home match (or tell me where to send them).
• Exclusive sideline seating at all home matches — chairs and tent provided. Come find the '78 Club tent.
• Your name on the '78 Club plaque, on the wall of the clubhouse and at {{site_url}} — it will read "{{plaque_name}}". If that's not quite right, just reply and I'll fix it.
• A vote toward the Founders' XV representative on the SBRFC board.

{{next_tier_line}}

{{ack}}

Thank you for showing up after the whistle. That is Grunion behavior.

${SIGNOFF}`,
  },
  {
    key: 'second',
    subject: "Welcome to The '78 Club, {{first_name}} — Second XV",
    body: `Hi {{first_name}},

You're in. Your gift of {{amount}} makes you a Second XV member of The '78 Club for the year ahead (through {{year_end}}).

Here's what that means:
• Your '78 Club polo and player training gear — the kit details you gave us:
{{kit_lines}}
• Your '78 Club pin and custom season mug — half-off beers at every home game.
• Exclusive sideline seating at all home matches — chairs and tent provided.
• Your name on the '78 Club plaque, on the wall of the clubhouse and at {{site_url}} — it will read "{{plaque_name}}" under Second XV. If that's not quite right, just reply and I'll fix it.
• A vote toward the Founders' XV representative on the SBRFC board.

We'll hand over the pin, mug and polo at the next home match, or tell me where to send them.

{{next_tier_line}}

{{ack}}

Thank you for paying in, hauling gear and feeding the pack — in whatever form it takes this season.

${SIGNOFF}`,
  },
  {
    key: 'founders',
    subject: "Welcome to the Founders' XV, {{first_name}}",
    body: `Hi {{first_name}},

Welcome to the Founders' XV. Your gift of {{amount}} puts you in the top tier of The '78 Club — and permanently on the Founders' XV plaque.

Here's what that means:
• Your Founders' XV jersey with your name and number — the details you gave us:
{{kit_lines}}
• Permanent placement on the Founders' XV plaque, in the clubhouse and at {{site_url}} — it will read "{{plaque_name}}". If that's not quite right, just reply and I'll fix it.
• Your custom season mug — free beers at every home game — plus the '78 Club pin and polo.
• Exclusive sideline seating at all home matches — chairs and tent provided.
• An invitation to the annual Founders' XV get-together.
• A vote toward the Founders' XV representative on the SBRFC board.

I'll be in touch about the jersey and the get-together. The pin, mug and polo are yours at the next home match, or tell me where to send them.

{{ack}}

This is the roll call the club was built on. Thank you for taking your place in it.

${SIGNOFF}`,
  },
  {
    key: 'upgrade',
    subject: "You've moved up — {{tier}}, The '78 Club",
    body: `Hi {{first_name}},

Your gift of {{amount}} brings your '78 Club total for the year to {{total}} — which moves you up from {{tier_before}} to {{tier}}. Your name on the plaque moves with you.

{{kit_lines}}

I'll reach out about the extra kit that comes with {{tier}}. If you'd like the plaque to read differently from "{{plaque_name}}", just reply.

{{next_tier_line}}

{{ack}}

Thank you for keeping the club stronger than you found it.

${SIGNOFF}`,
  },
  {
    key: 'topup',
    subject: "Thank you, {{first_name}} — '78 Club total now {{total}}",
    body: `Hi {{first_name}},

Thank you for the extra {{amount}}. That brings your '78 Club total for the membership year to {{total}} ({{tier}}).

{{next_tier_line}}

{{ack}}

${SIGNOFF}`,
  },
  {
    key: 'notify',
    subject: "'78 Club: {{action}} — {{first_name}} {{last_name}} — {{tier}} ({{amount}})",
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

// ---- handler --------------------------------------------------------------------------
export default async (req) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!gate(req)) return json({ ok: true, service: "The '78 Club webhook", hint: 'POST from Zeffy only' });
    // status + one-time setup (creates the tabs and seeds the templates)
    const out = { ok: true, checks: {} };
    out.checks.webhook_secret = !!process.env.ZEFFY_WEBHOOK_SECRET;
    out.checks.zeffy_api_key = !!process.env.ZEFFY_API_KEY;
    out.checks.google_credentials = !!googleCreds();
    try {
      const auth = await googleAuth(googleCreds());
      const g = gapi(auth.token);
      out.checks.google_mode = auth.mode;
      out.checks.google_delegation = auth.canEmail;
      if (auth.delegationError) out.checks.delegation_error = auth.delegationError;
      const templates = await ensureSheets(g);
      out.checks.signups_sheet = true;
      out.checks.templates = Object.keys(templates);
      const meta = await g.meta(CONFIG.WEBSITE_SHEET_ID);
      out.checks.patron_wall_tab = (meta.sheets || []).find((s) => s.properties.sheetId === CONFIG.PATRON_WALL_GID)?.properties.title || null;
    } catch (e) { out.checks.google_error = e.message; }
    try {
      const camps = await zeffyList('/campaigns');
      if (camps) {
        const hit = camps.find((c) => lower(c.id) === lower(CONFIG.CLUB78_CAMPAIGN_ID)) || camps.find((c) => CONFIG.CLUB78_TITLE_RE.test(c.title || ''));
        out.checks.club78_campaign = hit ? { id: hit.id, title: hit.title, matches_config_id: lower(hit.id) === lower(CONFIG.CLUB78_CAMPAIGN_ID) } : 'not found';
      }
    } catch (e) { out.checks.zeffy_api_error = e.message; }
    // ?backfill=DAYS[&max=N]  → (re)process recent '78 Club payments from the Zeffy API:
    // catches anything paid while the webhook was off or the pipeline was failing, and
    // finishes rows left "pending" (e.g. emails waiting on delegation). Idempotent.
    const url = new URL(req.url);
    if (url.searchParams.has('backfill')) {
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('backfill')) || 30));
      const max = Math.min(10, Math.max(1, Number(url.searchParams.get('max')) || 2));
      const started = Date.now();
      out.backfill = { days, processed: [], remaining: 0 };
      try {
        const since = Math.floor(Date.now() / 1000) - days * 86400;
        const list = (await zeffyList('/payments', { campaign: CONFIG.CLUB78_CAMPAIGN_ID, 'created[gte]': since })) || [];
        const todo = list.filter((p) => paymentOk(p)).sort((a, b) => createdMs(a) - createdMs(b));
        out.backfill.found = todo.length;
        for (const p of todo) {
          if (out.backfill.processed.length >= max || Date.now() - started > CONFIG.BUDGET_MS - 3500) { out.backfill.remaining++; continue; }
          try { const r = await processPayment(p, { eventId: 'backfill' }); out.backfill.processed.push(r.duplicate ? { payment_id: p.id, duplicate: true } : r); }
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
  if (!simulate) {
    const v = verifyZeffySignature(raw, req.headers.get('zeffy-signature') || req.headers.get('Zeffy-Signature'), process.env.ZEFFY_WEBHOOK_SECRET);
    if (!v.ok) return json({ error: 'invalid signature', why: v.why }, v.why === 'no secret configured' ? 500 : 400);
  }
  if (event?.type && event.type !== 'payment.completed') return json({ ok: true, ignored: event.type });
  const p = event?.data;
  if (!p || !p.id) return json({ error: 'no payment in event' }, 400);
  if (!paymentOk(p)) return json({ ok: true, ignored: `status ${p.status} / refund ${p.refund_status}` });

  try {
    const result = await processPayment(p, { eventId: event.id, simulate, dry });
    return json(result);
  } catch (e) {
    // non-2xx → Zeffy retries (up to 5×); the log row makes the retry resume, not repeat
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
};

// ============================================================================
// Grunion RFC dashboard — Google Analytics (GA4) stats
// GET /.netlify/functions/ga-stats?days=30        (7 | 30 | 90)
// Requires header  x-dashboard-key: <DASHBOARD_KEY env var>
//
// Env vars (Site configuration → Environment variables, scope: Functions):
//   DASHBOARD_KEY            (required)  shared passcode for the dashboard
//   GA_CLIENT_EMAIL          service account email …@…iam.gserviceaccount.com
//   GA_PRIVATE_KEY           the private_key value from the service-account JSON
//     — or instead of those two —
//   GA_SERVICE_ACCOUNT_JSON  the entire service-account JSON file, pasted
//   GA_PROPERTY_ID           (optional)  numeric GA4 property id; auto-discovered
//                            from the properties the service account can read
// ============================================================================

import { createSign, timingSafeEqual } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta';

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

async function getToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const sig = b64url(signer.sign(privateKey));
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${header}.${claims}.${sig}`,
  });
  const r = await fetch(TOKEN_URL, { method: 'POST', body });
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    throw new Error(`Google token exchange failed: ${data.error_description || data.error || r.status}`);
  }
  return data.access_token;
}

async function discoverProperty(token) {
  const r = await fetch(`${ADMIN_API}/accountSummaries?pageSize=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`GA property auto-discovery failed (${r.status}); set GA_PROPERTY_ID`);
  const data = await r.json();
  const prop = (data.accountSummaries || [])
    .flatMap((a) => a.propertySummaries || [])
    .map((p) => p.property)[0];
  if (!prop) {
    throw new Error(
      'The service account can’t see any GA4 property — add it as a Viewer in Property access management'
    );
  }
  return prop.replace('properties/', '');
}

const rows = (report) => report?.rows || [];
const dim = (row, i) => row.dimensionValues?.[i]?.value ?? '';
const met = (row, i) => Number(row.metricValues?.[i]?.value ?? 0);

export default async (req) => {
  const denied = gate(req);
  if (denied) return denied;

  let email = process.env.GA_CLIENT_EMAIL;
  let pk = process.env.GA_PRIVATE_KEY;
  if ((!email || !pk) && process.env.GA_SERVICE_ACCOUNT_JSON) {
    try {
      const sa = JSON.parse(process.env.GA_SERVICE_ACCOUNT_JSON);
      email = email || sa.client_email;
      pk = pk || sa.private_key;
    } catch {
      /* fall through to the configured:false response */
    }
  }
  if (!email || !pk) {
    return json({
      configured: false,
      error: 'GA service account not set (GA_CLIENT_EMAIL + GA_PRIVATE_KEY, or GA_SERVICE_ACCOUNT_JSON)',
    });
  }
  pk = pk.replace(/\\n/g, '\n');

  const daysParam = Number(new URL(req.url).searchParams.get('days'));
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;

  try {
    const token = await getToken(email, pk);
    const property = process.env.GA_PROPERTY_ID || (await discoverProperty(token));

    const current = { startDate: `${days - 1}daysAgo`, endDate: 'today', name: 'current' };
    const previous = { startDate: `${2 * days - 1}daysAgo`, endDate: `${days}daysAgo`, name: 'previous' };
    const metricsMain = [
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
      { name: 'sessions' },
    ];

    const requests = [
      { // 0 — daily series
        dateRanges: [current],
        dimensions: [{ name: 'date' }],
        metrics: metricsMain,
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: '400',
      },
      { // 1 — totals, current vs previous period
        dateRanges: [current, previous],
        metrics: [...metricsMain, { name: 'averageSessionDuration' }],
      },
      { // 2 — top pages
        dateRanges: [current],
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: '10',
      },
      { // 3 — channels
        dateRanges: [current],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '8',
      },
      { // 4 — referrers / sources
        dateRanges: [current],
        dimensions: [{ name: 'sessionSource' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '10',
      },
    ];

    const r = await fetch(`${DATA_API}/properties/${property}:batchRunReports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requests }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = data.error?.message || `GA Data API ${r.status}`;
      const hint = /permission/i.test(msg)
        ? ' — make sure the service account email was added as Viewer on the GA4 property'
        : '';
      throw new Error(msg + hint);
    }
    const [daily, totals, pages, channels, referrers] = data.reports || [];

    const totalsOut = { current: null, previous: null };
    for (const row of rows(totals)) {
      const key = dim(row, 0) === 'previous' ? 'previous' : 'current';
      totalsOut[key] = {
        users: met(row, 0),
        views: met(row, 1),
        sessions: met(row, 2),
        avgSessionSec: Math.round(met(row, 3)),
      };
    }

    return json({
      configured: true,
      property,
      days,
      daily: rows(daily).map((row) => ({
        date: dim(row, 0), // YYYYMMDD
        users: met(row, 0),
        views: met(row, 1),
        sessions: met(row, 2),
      })),
      totals: totalsOut,
      topPages: rows(pages).map((row) => ({ path: dim(row, 0), title: dim(row, 1), views: met(row, 0) })),
      channels: rows(channels).map((row) => ({ name: dim(row, 0), sessions: met(row, 0) })),
      referrers: rows(referrers).map((row) => ({ name: dim(row, 0), sessions: met(row, 0) })),
    });
  } catch (e) {
    return json({ configured: true, error: String(e.message || e) }, 502);
  }
};

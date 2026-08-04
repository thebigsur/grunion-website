// ============================================================================
// Grunion RFC dashboard — Netlify site health (forms + deploy status)
// GET /.netlify/functions/netlify-stats?days=30      (7 | 30 | 90)
// Requires header  x-dashboard-key: <DASHBOARD_KEY env var>
//
// Env vars (Site configuration → Environment variables):
//   DASHBOARD_KEY      (required)  shared passcode for the dashboard
//   NETLIFY_API_TOKEN  (required)  personal access token (User settings →
//                                  Applications → New access token)
//   NETLIFY_SITE_ID    (optional)  auto-discovered by domain when omitted
//   SITE_DOMAIN        (optional)  defaults to grunionrugby.com
//
// Traffic reporting comes from Google Analytics (ga-stats.mjs); this function
// only uses Netlify's documented API for form submissions and deploy status.
// ============================================================================

import { timingSafeEqual } from 'node:crypto';

const API = 'https://api.netlify.com/api/v1';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function gate(req) {
  const expected = process.env.DASHBOARD_KEY;
  if (!expected) return json({ error: 'DASHBOARD_KEY is not set on this site' }, 503);
  const got = req.headers.get('x-dashboard-key') || '';
  const a = Buffer.from(String(got));
  const b = Buffer.from(String(expected));
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return ok ? null : json({ error: 'unauthorized' }, 401);
}

export default async (req) => {
  const denied = gate(req);
  if (denied) return denied;

  const token = process.env.NETLIFY_API_TOKEN;
  if (!token) return json({ configured: false, error: 'NETLIFY_API_TOKEN not set' });

  const daysParam = Number(new URL(req.url).searchParams.get('days'));
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;

  const headers = { Authorization: `Bearer ${token}` };
  const getJ = async (url) => {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Netlify API ${r.status} on ${url.replace(/^https?:\/\/[^/]+/, '')}`);
    return r.json();
  };
  const attempt = (p) => p.then((v) => ({ ok: true, v })).catch((e) => ({ ok: false, e: String(e.message || e) }));

  try {
    // ---- resolve the site -------------------------------------------------
    const wantDomain = (process.env.SITE_DOMAIN || 'grunionrugby.com').toLowerCase();
    let site = null;
    if (process.env.NETLIFY_SITE_ID) {
      site = await getJ(`${API}/sites/${process.env.NETLIFY_SITE_ID}`).catch(() => null);
    }
    if (!site) {
      const sites = await getJ(`${API}/sites?filter=all&per_page=100`);
      const matches = (s, d) =>
        [s.custom_domain, s.default_domain, ...(s.domain_aliases || [])]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase() === d || String(x).toLowerCase().endsWith(`.${d}`)) ||
        String(s.url || '').toLowerCase().includes(d);
      site =
        sites.find((s) => matches(s, wantDomain)) ||
        sites.find((s) => String(s.name || '').toLowerCase().includes('grunion')) ||
        sites[0];
      if (!site) throw new Error('No sites visible to this token');
    }
    const siteId = site.id || site.site_id;
    const from = Date.now() - days * 86400e3;

    // ---- forms: count submissions inside the window -----------------------
    const formsRes = await attempt(getJ(`${API}/sites/${siteId}/forms`));
    let forms = [];
    if (formsRes.ok && Array.isArray(formsRes.v)) {
      forms = await Promise.all(
        formsRes.v.map(async (f) => {
          const out = { id: f.id, name: f.name, total: f.submission_count ?? null, inRange: null, lastAt: null };
          const subs = await attempt(getJ(`${API}/forms/${f.id}/submissions?per_page=100`));
          if (subs.ok && Array.isArray(subs.v)) {
            const times = subs.v.map((s) => Date.parse(s.created_at || '')).filter((t) => Number.isFinite(t));
            out.inRange = times.filter((t) => t >= from).length;
            out.lastAt = times.length ? new Date(Math.max(...times)).toISOString() : null;
          }
          return out;
        })
      );
    }

    // ---- deploy status ----------------------------------------------------
    const pub = site.published_deploy;
    const deploy = pub
      ? {
          state: pub.state || 'ready',
          publishedAt: pub.published_at || pub.created_at || null,
          branch: pub.branch || null,
          title: pub.title || null,
        }
      : null;

    return json({
      configured: true,
      days,
      site: { id: siteId, name: site.name, domain: site.custom_domain || site.default_domain || site.url || null },
      forms,
      deploy,
    });
  } catch (e) {
    return json({ configured: true, error: String(e.message || e) }, 502);
  }
};

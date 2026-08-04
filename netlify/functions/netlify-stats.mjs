// ============================================================================
// Grunion RFC dashboard — Netlify stats (Analytics + forms + deploy)
// GET /.netlify/functions/netlify-stats?days=30      (7 | 30 | 90)
// Requires header  x-dashboard-key: <DASHBOARD_KEY env var>
//
// Env vars (Site configuration → Environment variables, scope: Functions):
//   DASHBOARD_KEY      (required)  shared passcode for the dashboard
//   NETLIFY_API_TOKEN  (required)  personal access token (User settings →
//                                  Applications → New access token)
//   NETLIFY_SITE_ID    (optional)  auto-discovered by domain when omitted
//   SITE_DOMAIN        (optional)  defaults to grunionrugby.com
//
// Note: the Analytics endpoints (analytics.services.netlify.com) are not an
// officially documented API. Every call is individually caught, so if Netlify
// changes them the dashboard still gets forms + deploy data and clearly marks
// traffic data as unavailable.
// ============================================================================

import { timingSafeEqual } from 'node:crypto';

const API = 'https://api.netlify.com/api/v1';
const ANALYTICS = 'https://analytics.services.netlify.com/v2';

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

// "-0700" style offset for America/Los_Angeles, so Netlify buckets days the
// same way GA (property timezone) and Josh's clock do.
function laOffset() {
  try {
    const name = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      timeZoneName: 'longOffset',
    })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName').value; // e.g. "GMT-07:00"
    const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
    return m ? `${m[1]}${m[2]}${m[3]}` : '+0000';
  } catch {
    return '+0000';
  }
}

// The analytics service answers in a couple of shapes; normalize defensively.
const seriesOf = (payload) => {
  const data = payload?.data ?? payload;
  if (!Array.isArray(data)) return [];
  return data
    .map((e) => {
      if (Array.isArray(e)) return { ts: Number(e[0]), value: Number(e[1] ?? 0) };
      if (e && typeof e === 'object') {
        const ts = Number(e.timestamp ?? e.ts ?? e.date ?? e.start ?? NaN);
        const value = Number(e.count ?? e.value ?? e.pageviews ?? e.visitors ?? e.total ?? 0);
        return Number.isFinite(ts) ? { ts, value } : null;
      }
      return null;
    })
    .filter(Boolean);
};

const totalOf = (payload) => {
  const data = payload?.data ?? payload;
  if (typeof data === 'number') return data;
  if (Array.isArray(data)) return seriesOf(payload).reduce((s, p) => s + p.value, 0);
  if (data && typeof data === 'object') {
    const n = Number(data.count ?? data.total ?? data.value ?? NaN);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const rankingOf = (payload) => {
  const data = payload?.data ?? payload;
  if (!Array.isArray(data)) return [];
  return data
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      const label = e.resource ?? e.path ?? e.source ?? e.page ?? e.name ?? e.country ?? null;
      const count = Number(e.count ?? e.pageviews ?? e.visitors ?? e.total ?? 0);
      return label != null ? { label: String(label), count } : null;
    })
    .filter(Boolean);
};

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
    if (!r.ok) throw new Error(`${r.status} on ${url.replace(/^https?:\/\/[^/]+/, '')}`);
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

    // ---- time windows -----------------------------------------------------
    const to = Date.now();
    const from = to - days * 86400e3;
    const prevTo = from;
    const prevFrom = from - days * 86400e3;
    const tz = encodeURIComponent(laOffset());
    const range = (f, t, extra) => `from=${Math.round(f)}&to=${Math.round(t)}&timezone=${tz}${extra || ''}`;
    const an = (path, f, t, extra) => `${ANALYTICS}/${siteId}/${path}?${range(f, t, extra)}`;

    // ---- fire everything in parallel -------------------------------------
    const [
      pv, pvPrev,
      visDaily, visRange, visPrev,
      pagesRank, sourcesRank, notFoundRank,
      bandwidth,
      formsRes, deployRes,
    ] = await Promise.all([
      attempt(getJ(an('pageviews', from, to, '&resolution=day'))),
      attempt(getJ(an('pageviews', prevFrom, prevTo, '&resolution=day'))),
      attempt(getJ(an('visitors', from, to, '&resolution=day'))),
      attempt(getJ(an('visitors', from, to, '&resolution=range'))),
      attempt(getJ(an('visitors', prevFrom, prevTo, '&resolution=range'))),
      attempt(getJ(an('ranking/pages', from, to, '&limit=10'))),
      attempt(getJ(an('ranking/sources', from, to, '&limit=10'))),
      attempt(getJ(an('ranking/not_found', from, to, '&limit=10'))),
      attempt(getJ(an('bandwidth', from, to, '&resolution=day'))),
      attempt(getJ(`${API}/sites/${siteId}/forms`)),
      attempt(getJ(`${API}/sites/${siteId}`)),
    ]);

    // ---- forms: count submissions inside the window -----------------------
    let forms = [];
    if (formsRes.ok && Array.isArray(formsRes.v)) {
      forms = await Promise.all(
        formsRes.v.map(async (f) => {
          const out = {
            id: f.id,
            name: f.name,
            total: f.submission_count ?? null,
            inRange: null,
            lastAt: null,
          };
          const subs = await attempt(getJ(`${API}/forms/${f.id}/submissions?per_page=100`));
          if (subs.ok && Array.isArray(subs.v)) {
            const times = subs.v
              .map((s) => Date.parse(s.created_at || ''))
              .filter((t) => Number.isFinite(t));
            out.inRange = times.filter((t) => t >= from && t <= to).length;
            out.lastAt = times.length ? new Date(Math.max(...times)).toISOString() : null;
          }
          return out;
        })
      );
    }

    // ---- deploy status ----------------------------------------------------
    const pub = deployRes.ok ? deployRes.v.published_deploy : site.published_deploy;
    const deploy = pub
      ? {
          state: pub.state || 'ready',
          publishedAt: pub.published_at || pub.created_at || null,
          branch: pub.branch || null,
          title: pub.title || null,
        }
      : null;

    const analyticsOk = pv.ok || visDaily.ok || pagesRank.ok || sourcesRank.ok;

    return json({
      configured: true,
      days,
      site: {
        id: siteId,
        name: site.name,
        domain: site.custom_domain || site.default_domain || site.url || null,
      },
      analytics: {
        available: analyticsOk,
        note: analyticsOk
          ? null
          : `Netlify Analytics endpoints unreachable with this token (${[pv, visDaily, pagesRank]
              .filter((x) => !x.ok)
              .map((x) => x.e)
              .find(Boolean) || 'unknown'})`,
        pageviews: {
          series: pv.ok ? seriesOf(pv.v) : [],
          total: pv.ok ? totalOf(pv.v) : null,
          prevTotal: pvPrev.ok ? totalOf(pvPrev.v) : null,
        },
        visitors: {
          series: visDaily.ok ? seriesOf(visDaily.v) : [],
          total: visRange.ok ? totalOf(visRange.v) : visDaily.ok ? totalOf(visDaily.v) : null,
          prevTotal: visPrev.ok ? totalOf(visPrev.v) : null,
        },
        topPages: pagesRank.ok ? rankingOf(pagesRank.v) : [],
        sources: sourcesRank.ok ? rankingOf(sourcesRank.v) : [],
        notFound: notFoundRank.ok ? rankingOf(notFoundRank.v) : [],
        bandwidthBytes: bandwidth.ok ? totalOf(bandwidth.v) : null,
      },
      forms,
      deploy,
    });
  } catch (e) {
    return json({ configured: true, error: String(e.message || e) }, 502);
  }
};

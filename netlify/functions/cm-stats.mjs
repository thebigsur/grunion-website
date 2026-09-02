// ============================================================================
// Grunion RFC dashboard — Campaign Monitor stats
// GET /.netlify/functions/cm-stats
// Requires header  x-dashboard-key: <DASHBOARD_KEY env var>
//
// Env vars (Site configuration → Environment variables, scope: Functions):
//   DASHBOARD_KEY  (required)  shared passcode for the dashboard
//   CM_API_KEY     (required)  Campaign Monitor account API key
//   CM_CLIENT_ID   (optional)  auto-discovered from the account when omitted
// ============================================================================

import { timingSafeEqual } from 'node:crypto';

const API = 'https://api.createsend.com/api/v3.3';
const RECENT = 12; // campaigns charted/tabled

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

const parseCmDate = (d) => (d ? Date.parse(String(d).replace(' ', 'T')) || 0 : 0);

export default async (req) => {
  const denied = gate(req);
  if (denied) return denied;

  const key = process.env.CM_API_KEY;
  if (!key) return json({ configured: false, error: 'CM_API_KEY not set' });

  const auth = 'Basic ' + Buffer.from(`${key}:x`).toString('base64');
  const get = async (path) => {
    const r = await fetch(API + path, { headers: { Authorization: auth } });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`Campaign Monitor ${r.status} on ${path.split('?')[0]} ${body.slice(0, 160)}`);
    }
    return r.json();
  };

  try {
    let clientId = process.env.CM_CLIENT_ID;
    if (!clientId) {
      const clients = await get('/clients.json');
      if (!Array.isArray(clients) || clients.length === 0) {
        throw new Error('No clients found on this Campaign Monitor account');
      }
      clientId = clients[0].ClientID;
    }

    const [page, lists] = await Promise.all([
      get(`/clients/${clientId}/campaigns.json?pageSize=50`),
      get(`/clients/${clientId}/lists.json`).catch(() => []),
    ]);

    const all = (page.Results || [])
      .slice()
      .sort((a, b) => parseCmDate(b.SentDate) - parseCmDate(a.SentDate));
    const recent = all.slice(0, RECENT);

    const summaries = await Promise.all(
      recent.map((c) => get(`/campaigns/${c.CampaignID}/summary.json`).catch(() => null))
    );

    // oldest → newest so the chart reads left-to-right in time
    const campaigns = recent
      .map((c, i) => {
        const s = summaries[i] || {};
        const recipients = s.Recipients ?? c.TotalRecipients ?? 0;
        const openRate =
          recipients && s.UniqueOpened != null ? +((100 * s.UniqueOpened) / recipients).toFixed(1) : null;
        const clickRate =
          recipients && s.Clicks != null ? +((100 * s.Clicks) / recipients).toFixed(1) : null;
        return {
          id: c.CampaignID,
          name: c.Name,
          subject: c.Subject,
          sentDate: c.SentDate,
          webVersionURL: c.WebVersionURL || s.WebVersionURL || null,
          recipients,
          uniqueOpened: s.UniqueOpened ?? null,
          totalOpened: s.TotalOpened ?? null,
          clicks: s.Clicks ?? null,
          bounced: s.Bounced ?? 0,
          unsubscribed: s.Unsubscribed ?? 0,
          spamComplaints: s.SpamComplaints ?? 0,
          openRate,
          clickRate,
        };
      })
      .reverse();

    const listStats = (
      await Promise.all(
        (Array.isArray(lists) ? lists : []).map(async (l) => {
          try {
            const st = await get(`/lists/${l.ListID}/stats.json`);
            return {
              id: l.ListID,
              name: l.Name,
              totalActive: st.TotalActiveSubscribers ?? 0,
              newThisMonth: st.NewActiveSubscribersThisMonth ?? 0,
              unsubsThisMonth: st.UnsubscribesThisMonth ?? 0,
            };
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean);

    return json({
      configured: true,
      clientId,
      totalSent: page.TotalNumberOfRecords ?? all.length,
      campaigns,
      lists: listStats,
    });
  } catch (e) {
    return json({ configured: true, error: String(e.message || e) }, 502);
  }
};

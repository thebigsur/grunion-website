# Grunion Sponsor Board — how it works and how to look after it

Built Aug 25, 2026 (PT). A private, unlisted, view-only page that rolls up the
jersey-tile sponsor email campaign from Instantly across both sending inboxes
(treasurer@ and merman@) and every non-test campaign.

## Where it lives

- URL: `https://grunionrugby.com/board/<BOARD_SLUG>/` — the slug is the value of
  the `BOARD_SLUG` environment variable on the grunionrugby.com Netlify site
  (Site configuration → Environment variables; it is *not* marked secret, so it
  can be read there if the link is ever lost). No password: the random segment is
  the only gate, exactly like an unlisted video link.
- JSON feed the page renders: `https://grunionrugby.com/board/<BOARD_SLUG>/data`
  (add `?refresh=1` to skip the ~2-minute cache). Any other path under `/board/`
  returns a plain 404, including `/board/`, wrong slugs, and the function's
  default `/.netlify/functions/board` route.
- Code: `netlify/functions/board/board.mjs` (the Netlify Function — serves BOTH the
  page and the feed, custom path `/board/*`) and `netlify/functions/board/page.mjs`
  (the page's markup, CSS, and script as a template). There is deliberately no
  static HTML file: the repo is public on GitHub and Netlify publishes every repo
  file, so a hidden directory name would leak the URL. Nothing about the board is
  in `netlify.toml`, `sitemap.xml`, `robots.txt`, or any nav/footer.
- Privacy headers on every board response: `X-Robots-Tag: noindex, nofollow,
  noarchive`, `<meta name="robots" content="noindex, nofollow, noarchive">`,
  `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`,
  `X-Frame-Options: DENY`, and a Content-Security-Policy that allows only the
  page's own hashed inline script (plus Netlify's same-origin RUM tag).

## The Instantly key

- `INSTANTLY_KEY` on the same Netlify site is a **read-only** Instantly API v2
  key named **"GRC-board (read-only)"** (scope `all:read`, id
  `5407f2de-aa4b-43de-b05a-92ff4cb8878d`, created Aug 26, 2026 UTC). It is marked
  *secret* in Netlify (write-only; contexts production / deploy-preview /
  branch-deploy / dev; scope Functions). Its value exists nowhere else — not in the
  repo, not on the page, not in chat. Verified: `POST /campaigns` with it → 401
  "Invalid scope. Required: campaigns:create. Found: all:read" (same for PATCH and
  DELETE), while GETs return 200.
- The function only ever issues GET requests to Instantly, so even a full-access
  key could not send, create, edit, or delete anything through it.
- **To rotate it:** mint a new read-only key with the GRC2 (full) key —
  `POST https://api.instantly.ai/api/v2/api-keys` with body
  `{"name":"GRC-board (read-only)","scopes":["all:read"]}` (the key value is only
  in that response) — paste it into `INSTANTLY_KEY` in the Netlify UI, then
  trigger a deploy (functions only pick up env changes on deploy). Revoke the old
  key in Instantly → Settings → Integrations → API keys. If the key stops working
  the page keeps showing the last good numbers with a "stale since …" banner.
- **To move the board to a new secret URL:** change `BOARD_SLUG` in Netlify and
  redeploy; the old link stops working immediately after the deploy.
- Note: Instantly also holds a full-access key named "Dashboard" (all:all) created
  Aug 26, 2026 02:51 UTC that the board does not use; delete it in Instantly if
  it was an experiment.

## What's on the page (simplified Aug 26, 2026 — every number is ALL non-test campaigns combined)

Scoreboard: businesses contacted (with progress against the whole list), replies
(+ auto-replies shown separately), unsubscribes, bounces, emails sent (+ today),
days left until Fri Oct 16. Then a list of who unsubscribed (only when there are
any), the latest replies (address, when, which inbox, first line of the reply;
auto-replies tagged), the two sending inboxes (sent today vs Instantly's daily
cap, warmup score, status), and emails per day for the last 14 days (UTC days,
to match Instantly) with a table view. There is deliberately no per-campaign
view and no PROD-only section — the one-off "(priority)" campaigns and PROD are
always added together.

Definitions:
- Test campaigns = names containing the whole word TEST, FORMAT, or TIMING
  (case-insensitive) — excluded from every number; PROD is matched by id
  (`5a76e2ad-15a1-40af-81af-2475a69bd4dc`) so it can never be mistaken for a test.
- "Replies" = Instantly `reply_count_unique` (businesses that replied);
  auto-replies (`reply_count_automatic`) are shown separately. Reply rate =
  replies ÷ businesses contacted.
- "Unsubscribes" = Instantly's own unsubscribes (recipients who used the
  Unsubscribe button that the List-Unsubscribe header puts in Gmail/Outlook —
  PROD has `insert_unsubscribe_header` on; there is no unsubscribe link in the
  email body) PLUS businesses that asked to be removed *by replying* (the reply's
  own text matches unsubscribe / opt out / remove me / take us off / stop
  emailing / not interested / no thanks, auto-replies excluded). Instantly alone
  only counts the first kind, which is why the board reads the replies too. The
  "Unsubscribed" list shows each address and how it opted out; entries on the
  Instantly block list are included as well.
- "Sent today" per inbox counts emails from live campaigns only, on today's
  Pacific date. Instantly's own daily cap resets on its clock (not Pacific), so
  this number can exceed the cap on days when sending runs past 5 PM PT.
- Open tracking is off in Instantly, so opens are never shown.
- Reading Instantly's own analytics page: its default "Last 4 weeks" window ends
  on the current UTC date, so on evenings PT it can lag the board by that day's
  late sends (seen Aug 25: page showed 20/22 while the all-time figures were
  38/40). The board always uses all-time totals.

## Operating notes

- Data is cached for ~2 minutes per warm function instance; Refresh forces a new
  pull (at most once per 15 s). If Instantly errors, the function serves the last
  good payload with `stale_since`, and the page also keeps a copy in the phone's
  localStorage so it can show numbers while offline ("saved on this device").
- Typical fetch: ~0.5–0.8 s, 6 requests + one daily-analytics call per live
  campaign that has sent anything (Instantly's daily endpoint takes a single
  campaign id).
- Deploys: pushing to `main` rebuilds the site from git as usual. The function
  is dependency-free (node built-ins only) like the dashboard functions — keep
  it that way (CLAUDE.md rule). Env var changes need a redeploy.
- The first production deploy on Aug 25 (PT) was made with the Netlify CLI from a
  clone of the repo at commit b7e9fcd plus these files, so the live site and git
  are identical once the same files are pushed.

## Verification done at launch (Aug 25, 2026 PT)

PROD figures matched Instantly's campaign analytics endpoint field for field
(leads 1,246; contacted 38; sent 40; replies 0; auto-replies 1; bounced 0;
unsubscribed 0; completed 1; Email 1/2/3 sent 38/2/0). Every existing page,
redirect, and header behaved exactly as before (byte-identical apart from
Netlify's own injected analytics attribute). Wrong slugs, `/board/`, and the
default function route all 404. No key or slug string appears in the repo, the
page source, or the feed. Rendered and checked at 390 px in light and dark.

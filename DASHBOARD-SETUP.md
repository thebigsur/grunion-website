# Grunion Club Dashboard — setup

A private, live dashboard at **grunionrugby.com/dashboard/** showing Campaign
Monitor email performance, Google Analytics web traffic and traffic sources,
and site health (form submissions, deploy status). It fetches fresh data every
time it's opened — no ongoing maintenance.

**How it stays private:** the page isn't linked from anywhere on the site, is
`noindex`ed (page meta + `X-Robots-Tag` header), and — the real lock — every
data endpoint is a Netlify Function that refuses to answer without the
dashboard passcode. API keys live only in Netlify environment variables, never
in the repo or the browser.

## Files

| File | What it is |
|---|---|
| `dashboard/index.html` | the dashboard page (self-contained, no build step) |
| `netlify/functions/cm-stats.mjs` | Campaign Monitor: last 12 campaigns, open/click rates, list size |
| `netlify/functions/ga-stats.mjs` | GA4: daily traffic, totals vs previous period, top pages, channels, referrers |
| `netlify/functions/netlify-stats.mjs` | Netlify: form submissions + deploy status (documented API only) |
| `netlify.toml` | adds the functions directory + noindex headers for `/dashboard/*` |

## Environment variables (the whole setup)

Add these in Netlify: **Site configuration → Environment variables → Add a variable**.
After adding them all, run **Deploys → Trigger deploy → Deploy site** — env
changes only take effect on a fresh deploy.

| Variable | Required | Where it comes from |
|---|---|---|
| `DASHBOARD_KEY` | yes | you invent it — the passcode committee members will type |
| `CM_API_KEY` | yes | Campaign Monitor (step 2) |
| `NETLIFY_API_TOKEN` | yes | Netlify (step 3) |
| `GA_CLIENT_EMAIL` | yes | Google service account (step 4) |
| `GA_PRIVATE_KEY` | yes | Google service account (step 4) |
| `CM_CLIENT_ID` | recommended | the "API Client ID" on CM's API page — lets the dashboard work with a client-scoped key |
| `GA_PROPERTY_ID` | recommended | the numeric id in GA Admin → Property settings. (Auto-discovery works only if the "Google Analytics Admin API" is also enabled in Google Cloud — setting the id directly skips that.) |
| `NETLIFY_SITE_ID` | no | auto-discovered by matching grunionrugby.com |
| `GA_SERVICE_ACCOUNT_JSON` | no | alternative to the two GA_ vars: paste the whole JSON key file |

## Step 1 — pick the passcode

Choose something memorable for the committee (e.g. a club in-joke, not a real
password you use elsewhere). Set it as `DASHBOARD_KEY`.

## Step 2 — Campaign Monitor API key (~2 min)

1. Log in at campaignmonitor.com → click your account name (top right) →
   **Account Settings**.
2. Open **API keys** and click **Show API key** (or generate one).
3. Copy it into `CM_API_KEY`.

## Step 3 — Netlify personal access token (~2 min)

1. app.netlify.com → your avatar (top right) → **User settings** →
   **Applications** → **Personal access tokens** → **New access token**.
2. Name it `club dashboard`, create, and copy the token.
3. Set it as `NETLIFY_API_TOKEN`.

## Step 4 — Google Analytics service account (~10 min, the long one)

This gives the dashboard read-only access to GA without your Google password.

1. Go to **console.cloud.google.com** (sign in with the Google account that can
   see the Grunion GA). If it asks, agree to the terms — no billing needed.
2. Top bar → project picker → **New project** → name `grunion-dashboard` → Create,
   then make sure it's the selected project.
3. **APIs & Services → Library** → search **"Google Analytics Data API"** → **Enable**.
4. **IAM & Admin → Service Accounts → Create service account** → name
   `grunion-dashboard` → **Done** (skip the optional role screens).
5. Click the new service account → **Keys** tab → **Add key → Create new key →
   JSON** → a `.json` file downloads. Open it in a text editor.
6. Now tell GA to let that account read: **analytics.google.com** → **Admin**
   (gear, bottom left) → under *Property* → **Property access management** →
   **+** → **Add users** → paste the `client_email` from the JSON file
   (ends in `.iam.gserviceaccount.com`) → role **Viewer** → uncheck "notify" → **Add**.
7. Set the env vars:
   - `GA_CLIENT_EMAIL` = the `client_email` value
   - `GA_PRIVATE_KEY` = the `private_key` value — paste the whole thing,
     `-----BEGIN PRIVATE KEY-----` through `-----END PRIVATE KEY-----`
     (Netlify's env editor handles multi-line values; the literal `\n` version
     from the raw JSON works too)

## Step 5 — deploy and open

1. Push the dashboard files to GitHub (Claude gives you the exact commands) —
   Netlify auto-deploys.
2. If you added env vars *after* that deploy finished, hit
   **Deploys → Trigger deploy → Deploy site** once more.
3. Open **https://grunionrugby.com/dashboard/** and enter the passcode. Each
   committee device remembers it until someone hits **Lock**.

## Troubleshooting

- **"Function not found"** — the site deployed without the `netlify/functions`
  folder, or the `[functions]` block in `netlify.toml` is missing. Redeploy.
- **"DASHBOARD_KEY isn't set"** — add the env var, then trigger a redeploy.
- **GA error mentioning permission** — step 4.6 wasn't done (the service
  account isn't a Viewer on the property), or it was added to the wrong property.
- **GA "token exchange failed"** — `GA_PRIVATE_KEY` got mangled in pasting;
  re-paste the whole block, or use `GA_SERVICE_ACCOUNT_JSON` with the entire file.
- **GA numbers look low compared to what Netlify's own dashboard claims** —
  GA counts real humans running the browser tag; server-side counts include
  bots, crawlers, and link-preview fetchers. GA is the honest number.
- **Build fails with "Secrets scanning found secrets"** — the passcode (or a
  key) literally appears as text somewhere in the site files. Pick a passcode
  that isn't a phrase written on the site (club words, the founding year, and
  the domain all trip this).

## Notes

- The dashboard page deliberately has **no GA snippet**, so checking it doesn't
  inflate the site's own traffic numbers.
- Rotating the passcode = change `DASHBOARD_KEY` + redeploy; committee re-enters it.
- Rotating any API key = replace the env var + redeploy. Nothing in the repo changes.

# Grunion Club Dashboard — setup

A private, live dashboard at **grunionrugby.com/dashboard/** showing ad campaign
results (Google, Facebook, Instagram), Campaign Monitor email performance, Google Analytics web traffic and traffic sources,
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
| `netlify/functions/ads-stats.mjs` | Ads tracker: Google Ads (via GA4) + Meta + our form leads, joined by campaign (step 6) |
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
| `META_ADS_TOKEN` | for the ads section | Meta system-user token, read-only (step 6d) |
| `META_AD_ACCOUNT_ID` | with the token | the club's Meta ad account id (step 6d) |

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
- **Every passcode is rejected right after setup** — `DASHBOARD_KEY` is probably
  missing on the site (the functions fail closed with a plain 401 and log the
  reason). Add the env var, then trigger a redeploy.
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

## Step 6 — Ads tracker (Google Ads + Facebook / Instagram)

The **Ad Campaigns** section at the top of the dashboard is fed by
`netlify/functions/ads-stats.mjs`. It joins three read-only sources by campaign
name, so a new campaign on either platform shows up on its own the day it
spends. There is no list of campaigns to keep up to date.

| Source | What it gives | Needs |
|---|---|---|
| Google Analytics (the service account from step 4) | Google Ads cost, impressions and clicks per campaign, site visits and the lead / tap events for every campaign on every platform | the Google Ads account linked to GA4 (6a) |
| Meta Marketing API | campaign list with status and start date, spend, impressions, link clicks, Instant Form leads, split Facebook vs Instagram | `META_ADS_TOKEN` + `META_AD_ACCOUNT_ID` (6d) |
| Netlify Forms (the token from step 3) | the play-signup and coach-application submissions with the campaign tags the landing pages stamp on them | nothing new |

### Extra environment variables

| Variable | Required | Where it comes from |
|---|---|---|
| `META_ADS_TOKEN` | for Facebook / Instagram figures | Meta system-user token with `ads_read` (6d) |
| `META_AD_ACCOUNT_ID` | with the token | Ads Manager → the account id shown in the account dropdown (digits, with or without `act_`) |
| `META_API_VERSION` | no | defaults to `v23.0`; only change it if Meta retires that version |
| `ADS_START_DATE` | no | `YYYY-MM-DD`; the "Since launch" range starts here (default 2026-09-01) |

Both Meta values also go in the **Grunion Project Keys** Google Doc in the
Grunion Private shared drive. After adding variables, trigger a deploy.

### 6a. Link Google Ads to Google Analytics (once, ~2 min)

This is what gives GA4 (and so the dashboard) Google's cost, clicks and
impressions per campaign. No Google Ads API and no developer token needed.

1. analytics.google.com → **Admin** (gear, bottom left) → under *Product links*
   click **Google Ads links** → **Link**.
2. Choose the club's Google Ads account (you need admin on both, signed in with
   the same Google account) → keep *Enable personalized advertising* and
   *Enable auto-tagging* on → **Submit**.
3. Cost data starts flowing within a day. Google's spend in the dashboard is
   always about a day behind; a brand-new Google campaign shows visits before
   it shows spend. That is normal.

Do this again for the **Ad Grants** account if the club gets one: same steps,
second link.

### 6b. Tag every Google click with the campaign (once, ~1 min)

Google already tags clicks (auto-tagging). This adds the campaign to what our
own forms record, for every campaign now and in future.

1. ads.google.com → **Admin** → **Account settings** → **Tracking**.
2. In **Final URL suffix** paste exactly:

   `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}`

3. Save. Google fills the `{…}` parts itself.

### 6c. Key events and Google Ads conversions (once, ~5 min, after this code is live)

The thank-you pages now send `lead_play` (a player sign-up) and `lead_coach`
(a coach application) to GA4, and the landing pages send `tap_text` and
`tap_email` when someone taps the text or email buttons.

1. analytics.google.com → **Admin** → **Key events** → **New key event** →
   type `lead_play` → Save. Repeat for `lead_coach`, `tap_text`, `tap_email`.
   (For `lead_play` and `lead_coach` set *Counting method* to **Once per
   session** if the option is offered.)
2. ads.google.com → **Goals** → **Conversions** → **Summary** → **+ New
   conversion action** → **Import** → **Google Analytics 4 properties → Web**
   → tick `lead_play` and `lead_coach` → Import and continue. Make both
   **Primary** so Google bids toward sign-ups instead of clicks.

The dashboard does not depend on this step (it counts the events directly);
Google's own bidding does.

### 6d. Meta read-only token (once, ~20 min)

Reading your own ad account needs no app review. You need to be an admin of
the club's Business portfolio (business.facebook.com) that holds the Facebook
Page, the Instagram account and the ad account.

1. **Create the app:** developers.facebook.com → **My Apps** → **Create app**
   → name it `Grunion dashboard`, type **Business**, pick the club's Business
   portfolio → Create. On the app page add the **Marketing API** product.
2. **Create a system user:** business.facebook.com → **Settings** (Business
   settings) → **Users** → **System users** → **Add** → name
   `grunion-dashboard`, role **Employee** → Create.
3. **Give it the ad account:** on that system user click **Assign assets** →
   **Ad accounts** → tick the club's ad account → turn on **View performance**
   (read only) → Save.
4. **Generate the token:** still on the system user → **Generate new token** →
   choose the `Grunion dashboard` app → token expiration **Never** →
   permissions: tick **ads_read** only → Generate. Copy it right away; Meta
   shows it once.
5. Netlify → **Site configuration → Environment variables**: add
   `META_ADS_TOKEN` (the token) and `META_AD_ACCOUNT_ID` (Ads Manager → account
   dropdown → the number under the account name). Trigger a deploy.
6. Paste both into the Grunion Project Keys doc.

If Meta insists on business verification before it lets you create a system
user, say so and the function can be switched to a 60-day user token that it
renews itself.

### 6e. Tag Meta ads that send people to the website (per ad, ~30 s)

Only for ads whose destination is grunionrugby.com (for example /play).
Instant Form ads report their leads through the API without this.

Ads Manager → the ad → **Tracking** section → **URL parameters** → paste:

`utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{placement}}`

Meta fills the `{{…}}` parts itself (`fb` or `ig`, the campaign name, the ad
name, the placement). The line carries over when you duplicate an ad. If it is
forgotten, the campaign shows an **Untagged** badge on the dashboard (clicks
but no tagged visits).

### What the columns mean

| Column | Meaning |
|---|---|
| Spend | what the platform charged in the range (Google via GA4, about a day behind; Meta live) |
| Clicks | clicks that go to the site: Google ad clicks, Meta *link* clicks (not likes or comments) |
| CTR / CPC | clicks ÷ impressions; spend ÷ clicks |
| Site visits / Engaged | GA4 sessions from that campaign and the share that stayed 10 s+ or did something |
| Site leads | play-signup + coach-application submissions whose visit carried that campaign's tags |
| Instant Form | leads Meta collected inside Facebook / Instagram (Meta's own count) |
| Leads | site leads + Instant Form leads. Cost / lead = spend ÷ leads |
| Taps | taps on the text / email buttons from that campaign's visits (GA4 events), never counted as leads |
| Facebook / Instagram (untagged) | visits and leads that came from Facebook or Instagram without campaign tags: an untagged ad, or the club's own bio link. Listed so totals add up, never counted as paid leads |
| Not from an ad | site leads with no ad tags at all (direct, organic search, word of mouth) |

Badges: **New** = first activity within 14 days · **New since your last visit**
= this browser had not seen the campaign before · **Untagged** = Meta clicks
but no tagged visits · **No leads** = $50+ spent with zero leads.

### Troubleshooting

- *Meta error (190) …* → the token was revoked or expired: generate a new one
  (6d step 4), update the env var, redeploy.
- *Meta error (100) … permission* → the system user lacks the ad account or
  the token lacks `ads_read`: redo 6d steps 3 and 4.
- *GA4 sees Google Ads visits but no cost data* → do 6a, or the ads only
  started today.
- *Untagged badge on a Meta campaign* → 6e, unless the campaign uses Instant
  Forms (then the badge can be ignored; its leads show in the Instant Form column).
- *A lead you know came from an ad shows "Not from an ad"* → the visitor
  arrived without tags (for example typed the address later from memory). The
  browser remembers tags for 30 days, so this is rare.
- *Numbers look a few minutes old* → the function caches for 10 minutes; the
  dashboard's Refresh button forces a fresh pull.

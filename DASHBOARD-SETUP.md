# Grunion Club Dashboard — setup

A private, live dashboard in two pages: **grunionrugby.com/dashboard/** (Overview:
Campaign Monitor email performance, Google Analytics web traffic and traffic
sources, site health) and **grunionrugby.com/dashboard/ads/** (Ad Campaigns:
Google, Google Ad Grants (sbrfc.com), Facebook and Instagram results, step 6).
One passcode covers both; the
header links between them. It fetches fresh data every
time it's opened — no ongoing maintenance.

**How it stays private:** the page isn't linked from anywhere on the site, is
`noindex`ed (page meta + `X-Robots-Tag` header), and — the real lock — every
data endpoint is a Netlify Function that refuses to answer without the
dashboard passcode. API keys live only in Netlify environment variables, never
in the repo or the browser.

## Files

| File | What it is |
|---|---|
| `dashboard/index.html` | the Overview page (email, web traffic, site health) |
| `dashboard/ads/index.html` | the Ad Campaigns page |
| `dashboard/dashboard.css`, `dashboard/dashboard-core.js` | styles + shared script (gate, api, tiles, charts) both pages load; no build step |
| `netlify/functions/cm-stats.mjs` | Campaign Monitor: last 12 campaigns, open/click rates, list size |
| `netlify/functions/ga-stats.mjs` | GA4: daily traffic, totals vs previous period, top pages, channels, referrers |
| `netlify/functions/netlify-stats.mjs` | Netlify: form submissions + deploy status (documented API only) |
| `netlify/functions/ads-stats.mjs` | Ads tracker: Google Ads and the sbrfc.com Ad Grants (via GA4) + Meta + our form leads on both sites, joined by campaign (step 6) |
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
| `META_AD_ACCOUNT_ID` | no | extra Meta ad account id(s); accounts assigned to the system user are found on their own (step 6d) |
| `SBRFC_GA_PROPERTY_ID` | no | defaults to `557211956`, the sbrfc.com GA4 property (step 6f); `off` leaves sbrfc.com out |

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

The **Ad Campaigns** page (grunionrugby.com/dashboard/ads/, linked from the
dashboard header) is fed by `netlify/functions/ads-stats.mjs`. It joins read-only sources by campaign
name, so a new campaign on any platform shows up on its own the day it
spends. There is no list of campaigns to keep up to date.

| Source | What it gives | Needs |
|---|---|---|
| Google Analytics, grunionrugby.com property (the service account from step 4) | Google Ads cost, impressions and clicks per campaign, site visits and the lead / tap events for every campaign on every platform | the Google Ads account linked to GA4 (6a) |
| Google Analytics, sbrfc.com property `557211956` (same service account) | the Google Ad Grants campaigns: grant spend, impressions, clicks, visits, and the sign-up / contact / click-through events the sbrfc.com pages send | already set up (6f) |
| Meta Marketing API | campaign list with status and start date, spend, impressions, link clicks, Instant Form leads, messages started from message ads, split Facebook vs Instagram. It reads every ad account assigned to the `grunion-dashboard` system user, plus any in `META_AD_ACCOUNT_ID`, each on its own, so one account failing never hides the others | `META_ADS_TOKEN` (6d) |
| Netlify Forms (the token from step 3) | the play-signup and coach-application submissions on grunionrugby.com and the six sign-up forms on sbrfc.com, with the campaign tags the pages stamp on them | nothing new: both sites are in the Grunion Rugby Netlify team |

### Extra environment variables

| Variable | Required | Where it comes from |
|---|---|---|
| `META_ADS_TOKEN` | for Facebook / Instagram figures | Meta system-user token with `ads_read` (6d) |
| `META_AD_ACCOUNT_ID` | no | extra ad account id(s), comma-separated (digits, with or without `act_`). Only needed for an account the system user can read but Meta doesn't list for it; assigned accounts are found on their own |
| `META_API_VERSION` | no | defaults to `v23.0`; only change it if Meta retires that version |
| `ADS_START_DATE` | no | `YYYY-MM-DD`; the "Since launch" range starts here (default 2026-09-01) |
| `SBRFC_GA_PROPERTY_ID` | no | the sbrfc.com GA4 property id, default `557211956`; `off` leaves sbrfc.com (its Analytics and its forms) out of the page |
| `SBRFC_NETLIFY_SITE_ID` | no | auto-discovered by matching sbrfc.com |

The Meta values also go in the **Grunion Project Keys** Google Doc in the
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

The club's **Ad Grants** account (922-418-2497) is linked to the sbrfc.com
property instead, because every grant ad lands on sbrfc.com (6f). As of
Oct 2026 the grunionrugby.com property has no Google Ads link: the Google
Search row stays at zero until a paid Google Ads account is linked here.

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
3. **Give it the ad account and the app:** on that system user click
   **Assign assets** → **Ad accounts** → tick the club's ad account → turn on
   **Manage campaigns** → Save. Then **Assign assets** again → **Apps** → tick
   `Grunion dashboard` → **Develop app** → Save (without this the token step
   says "No permissions available"). The token's `ads_read` scope is what keeps
   the dashboard read only, whatever the role says.
4. **Generate the token:** still on the system user → **Generate token** →
   choose the `Grunion dashboard` app → token expiration **Never** →
   permissions: tick **ads_read** only → Generate. Copy it right away; Meta
   shows it once.
4b. **Authorize the ad account for the app:** developers.facebook.com → the
   app → **App settings → Advanced → Advertising accounts → Authorized ad
   account IDs** → add the ad account id → Save changes. Needed while the app
   stays in Development mode (it can stay there for good).
5. Netlify → **Site configuration → Environment variables**: add
   `META_ADS_TOKEN` (the token). Trigger a deploy. The dashboard asks Meta
   which ad accounts the system user is assigned to and reads all of them;
   `META_AD_ACCOUNT_ID` is only for an extra account Meta doesn't list.
6. Paste the token into the Grunion Project Keys doc.

**Adding another ad account later** (for example one a boost was paid from):
put it in The Grunion RFC portfolio, assign it to the `grunion-dashboard`
system user (step 3, *View performance* is enough), and add its id under the
app's Authorized ad account IDs (4b). It shows up on the next refresh; no
deploy needed. The page lists the accounts it read under **By Campaign**. If
it doesn't appear there, Meta isn't listing it to the dashboard (this happens
with an Instagram-created account): add its id to `META_AD_ACCOUNT_ID` and
redeploy.

Do all of this logged in with a **Facebook** profile that has full control of
the portfolio, not the Instagram login (the developer portal only accepts a
Facebook login, and Business settings shows different things to each).

**Gotcha, learned 17 Sep 2026:** an ad account that Meta auto-created for the
Instagram login (its name is just its id number) is invisible to every app,
even Meta's own Graph API Explorer: every call fails with
`(#200) Ad account owner has NOT grant ads_management or ads_read permission`
no matter what permissions are set. The fix was to create the ad account in
Business settings → **Ad accounts → Add → Create a new ad account** while
logged in as a Facebook profile. That account is **Grunion RFC Ads**, id
`1792518825224191`.

**Update, 8 Oct 2026:** the auto-created `1987173712083863` (which pays for the
Instagram "Player Test" message ad) now belongs to The Grunion RFC portfolio,
`grunion-dashboard` is assigned to it, and the app authorizes it. Meta still
leaves it out of the accounts it lists for the system user, so it has to be
named in `META_AD_ACCOUNT_ID` (`1792518825224191,1987173712083863`) for the
dashboard to try it. If Meta still answers with the (#200) error, the page
shows a warning naming the account and Meta's reason, and Grunion RFC Ads
keeps reporting either way. The fallback is rebuilding the ad in Grunion RFC Ads.

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

### 6f. sbrfc.com and the Google Ad Grants (done Oct 2026)

The grant ads all land on sbrfc.com (repo `thebigsur/sbrfc-website`, Netlify
site `sbrfc` in the same team as this one), so the dashboard reads that site
too. Nothing new to set up:

- **Analytics:** property `sbrfc.com`, id `557211956`, in the Grunion Rugby
  Football Club GA account. The dashboard's service account is already a
  Viewer on it, and the Ad Grants account 922-418-2497 is linked to it (Admin
  → Product links → Google Ads links), which is where the grant spend,
  impressions and clicks come from.
- **Forms:** `mens-interest`, `womens-interest`, `youth-interest`,
  `general-interest` (player sign-ups), `sponsor-inquiry` and `coach-signup`,
  read with the same Netlify token. Their hidden `utm_*` / `gclid` fields say
  which ad a sign-up came from.
- **Events** (sbrfc.com `site.js`): `player_signup`, `sponsor_inquiry`,
  `coach_signup`, `contact_click`, `youth_register_click`, `club_site_click`.
  The first five are the conversions Google Ads imports.

Grant spend is free credit, so it is never added to the paid spend, clicks,
leads or cost per lead in the top tiles. It has its own **Google Ad Grants**
card (grant spend, click-through rate against Google's 5% monthly rule, sign-ups
and this month's conversions against the one-a-month rule, grant $ per sign-up)
and its own row in **By Platform** and **By Campaign**.

**Recommended, once (~1 min):** name the campaign on every grant sign-up.
Google Ads → **Admin → Account settings → Tracking → Final URL suffix**:

`utm_source=google&utm_medium=cpc&utm_campaign={campaignid}`

Until it is set, a grant sign-up carries only Google's click id, so it counts
toward Ad Grants as a whole and Analytics matches sign-ups to campaigns
instead (each campaign shows the higher of the two counts).

### What the columns mean

| Column | Meaning |
|---|---|
| Spend | what the platform charged in the range (Google via GA4, about a day behind; Meta live). For Google Ad Grants rows it is grant credit, not cash |
| Clicks | clicks that go to the site: Google ad clicks, Meta *link* clicks (not likes or comments) |
| CTR / CPC | clicks ÷ impressions; spend ÷ clicks |
| Site visits / Engaged | GA4 sessions from that campaign and the share that stayed 10 s+ or did something |
| Site leads | play-signup + coach-application submissions (and the sbrfc.com sign-up forms) whose visit carried that campaign's tags. For an Ad Grants campaign, Analytics' sign-up events are used where they are higher, because a grant sign-up names its campaign only once the Final URL suffix is set (6f) |
| Instant Form | leads Meta collected inside Facebook / Instagram (Meta's own count) |
| Leads | site leads + Instant Form leads. Cost / lead = spend ÷ leads, leaving out message campaigns (their spend and any lead they brought in) |
| Messages | Meta's "messaging conversations started": someone opened a chat (Instagram Direct, Messenger, WhatsApp) from an ad after 7+ days of quiet. Kept apart from leads |
| Cost / message | spend on message campaigns ÷ the messages they brought in. A message campaign is one whose ad sets send people into a chat (a "Get more messages" boost, or an Engagement campaign with a message destination; lead ads that run their form inside Messenger or Instagram Direct stay lead campaigns). A stray message on any other campaign is counted in Messages but not in cost per message |
| New contacts | Meta's "new messaging contacts": people messaging the club for the first time (in the Messages card and on hover) |
| Taps | taps on the text / email buttons (grunionrugby.com) and the call / text / email links (sbrfc.com) from that campaign's visits (GA4 events), never counted as leads |
| Click-throughs | sbrfc.com only: clicks on to the youth registration site and the three club sites |
| Facebook / Instagram, not paid | visits and leads from Facebook or Instagram that carried no paid-ad tags: the club's own posts and bio link (even with `utm_source=instagram&utm_medium=social`), a share, or an ad whose URL parameters are missing. Only a paid medium (`paid_social`, `cpc`) or a Google click id counts as an ad. Listed so totals add up, never counted as paid leads |
| Not from an ad | site leads with no ad tags at all (direct, organic search, word of mouth) |

Badges: **New** = first activity within 14 days · **New since your last visit**
= this browser had not seen the campaign before · **Untagged** = Meta clicks
but no tagged visits (never shown on message campaigns, which have no site
visit to tag) · **No leads** = $50+ spent with zero leads · **No messages** =
a message campaign with $50+ spent and zero messages · **Under 5%** (Ad Grants
card) = a grant campaign with 100+ impressions and a click-through rate under
Google's 5%.

The **Messages** card under the tiles totals messages, cost per message and
new contacts for the range, split by platform, and lists every campaign
with messages (message campaigns first).

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
- *A boost doesn't show up at all* → it is being paid from an ad account the
  dashboard doesn't read. The By Campaign card lists the accounts it read.
  Either build the ad in one of those (Grunion RFC Ads or 1987173712083863),
  or add its account as in 6d, "Adding another ad account later".
- *"No Google Ad Grants ad has shown yet"* → Google reports no grant
  impressions. Check the campaign statuses in Google Ads; the figures reach
  Analytics about a day late, so give a brand-new campaign a day.
- *Ad Grants click-through rate warning* → the account is under 5% for the
  month (shown once it has 500+ impressions). Google can pause the grant after
  two months in a row below 5%: pause the weakest keywords and campaigns.

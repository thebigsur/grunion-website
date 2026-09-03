# The '78 Club signup pipeline — setup & handbook

Built Aug 31 2026. Zeffy takes the money; this pipeline turns a payment into a
tiered member: welcome email from treasurer@sbrfc.com, name on the plaque,
internal notice, private log.

```
Donor → Zeffy '78 Club membership form ──payment.created───▶ /.netlify/functions/club78-webhook
                                                                │  verify Zeffy-Signature (HMAC)
                                                                │  membership-year total (12 mo from joining)
                                                                │  tier = Supporters' Union $350+ / Second XV $750+ / Founders' XV $2,500+
                                                                ├─▶ "'78 Club Signups" sheet (private log, Grunion Private drive)
                                                                ├─▶ Website Sheet → '78 Club Patron Wall tab (the plaque on the-78-club)
                                                                ├─▶ welcome / upgrade / top-up email FROM treasurer@sbrfc.com
                                                                └─▶ notice → treasurer@sbrfc.com
```

## Where things live

| Thing | Where |
| --- | --- |
| Zeffy form | https://www.zeffy.com/en-US/ticketing/the-78-club-grunion-rfc-legacy-donors (campaign id `bff55e80-4c68-40d9-9f72-d769d41697b3`) |
| Function | `netlify/functions/club78-webhook.mjs` — URL `https://grunionrugby.com/.netlify/functions/club78-webhook` |
| Private log + email templates | Google Sheet "'78 Club Signups" `1XJpBEDfpRu8BrF8yY6BotoyUSn2xOjbyTH3GOyedX2w` (Grunion Private shared drive), tabs `Signups` and `Emails` — both created by the function on first run |
| Plaque | Website Sheet `1BN4ctNLbtoy1-bPNNRM3WFc2SbpmM_YYNHLmVHCU0tA`, tab "'78 Club Patron Wall" (gid 299262421), columns Tier \| Name — site.js reads it |
| Site link | `CONFIG.JOIN_78_URL` in site.js; the "Join The '78 Club" / "Add your name" buttons carry `data-link="join78"` |
| Sender | treasurer@sbrfc.com via the club service account `grunion-dashboard@grunion-site-club.iam.gserviceaccount.com` (domain-wide delegation, scopes gmail.send + spreadsheets, in the **sbrfc.com** Workspace admin console) |

## Env vars (Netlify → Site configuration → Environment variables, scope Functions)

| Var | Purpose |
| --- | --- |
| `ZEFFY_WEBHOOK_SECRET` | `whsec_…` from Zeffy → Settings → Integrations → Webhook → Reveal secret. Rotating it in Zeffy invalidates the old one immediately — update Netlify first, then regenerate. |
| `ZEFFY_API_KEY` | Zeffy → Settings → Integrations → API Key. Read-only. Used to total a donor's giving and to name the rate they chose. Without it the function still works from its own log. |
| `GA_CLIENT_EMAIL` / `GA_PRIVATE_KEY` | Already set for the dashboard — the same service account. |
| `CLUB78_ADMIN_KEY` | **Set this.** A long random secret (`openssl rand -hex 24`) that gates the GET status/backfill/reseed endpoints and the simulate/dry harness, i.e. everything that can send mail as treasurer@ or write the plaque. Until it exists the function falls back to `DASHBOARD_KEY`, the committee passcode, which is memorable and sits in every committee member's browser. Keep this one out of the dashboard and in the Keys doc only. |
| `DASHBOARD_KEY` | Already set. Only the fallback for the above while `CLUB78_ADMIN_KEY` is missing. |
| `CLUB78_SIGNUPS_SHEET_ID` | Optional. Overrides the private Signups sheet id baked into the code. |
| `CLUB78_DISABLE_EMAIL` | Optional. `1` = log + plaque only, no emails (testing). |

Every secret's value also goes in the **Grunion Project Keys** doc (Grunion Private). Env changes need a redeploy to reach functions (Deploys → Trigger deploy).

## Rules the function follows

- **Only the '78 form creates members.** A payment on any other Zeffy donation form counts as a *top-up* if that email address already joined through the '78 form; events, shop and raffle payments never count.
- **Membership year** = one calendar year from the first qualifying payment (same date next year, so leap years are full years); the next payment on or after that date starts a new year. Everything inside the year is summed (Zeffy API history when the key is set, otherwise the Signups log).
- **Tier** = highest tier whose minimum the year total reaches. First time we see a donor → `join` (welcome email for their tier). Later payments → `upgrade` (crossed a higher minimum, plaque row moves up) or `topup` (thanks + running total).
- **Plaque name** = their answer to the plaque question, else "First Last". A top-up with no answer keeps the name they gave when they joined. "Anonymous" is a legal answer and is listed as such.
- **Acknowledgment text** in every email: amount, date, EIN, and either the benefit value deducted ($25 / $50 / $100 for the tier reached — only the *increase* on an upgrade) or "no goods or services" for top-ups. Zeffy issues no tax receipt on pay-what-you-can rates, so this email is the donor's written acknowledgment — don't remove it without talking to Josh.
- **Idempotent.** The Zeffy payment id is the key in the Signups tab. A retried delivery finishes whatever step failed (plaque / email / notice) instead of repeating it; a fully processed payment is answered with `duplicate: true`.
- Non-2xx responses make Zeffy retry up to 5×, so a Google or Zeffy outage self-heals.

## Editing the emails

Open the "'78 Club Signups" sheet → `Emails` tab. One row per template: `supporters`, `second`, `founders`, `upgrade`, `topup`, `notify`. Edit subject / body freely — no deploy needed. Placeholders:

`{{first_name}}` `{{last_name}}` `{{email}}` `{{tier}}` `{{tier_before}}` `{{amount}}` (this payment) `{{total}}` (year to date) `{{date}}` `{{year_end}}` `{{plaque_name}}` `{{kit_lines}}` (polo / jersey answers) `{{next_tier_line}}` (how far to the next tier, blank at Founders') `{{ack}}` (the tax acknowledgment paragraph) `{{advantage}}` `{{deductible}}` `{{rate}}` `{{receipt_url}}` `{{form_url}}` `{{site_url}}` `{{payment_id}}`; `notify` also gets `{{action}}` `{{notes}}` `{{sheet_url}}`.

If the tab is ever emptied, the function re-seeds the built-in defaults (bottom of the .mjs) on its next run.

## Checking it's alive

```
curl -s -H "x-dashboard-key: YOUR_CLUB78_ADMIN_KEY" https://grunionrugby.com/.netlify/functions/club78-webhook | python3 -m json.tool
```

(`x-dashboard-key` is the header name; the value is `CLUB78_ADMIN_KEY`, or the dashboard passcode until that is set.)

Expected: `webhook_secret: true`, `zeffy_api_key: true`, `admin_key: "CLUB78_ADMIN_KEY"`, `google_mode: "delegated"` / `google_delegation: true`, six template keys, `patron_wall_tab: "'78 Club Patron Wall"`, `stuck_sending: "none"`, and `club78_campaign.matches_config_id: true`. This call also creates the sheet tabs and seeds the templates, so run it once after the first deploy. `google_mode: "service-account"` means delegation is missing (see below) — sheets work, emails wait.

`google_delegation: false` with "unauthorized_client" = the domain-wide delegation step in the sbrfc.com admin console is missing or has the wrong scopes (needs exactly `https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/spreadsheets` on client id `104737401110086584512`).

## While domain-wide delegation is still missing

The function detects it and runs in **service-account mode**: it still logs the payment and updates the plaque (the two sheets are shared with the service account directly), but it cannot send mail, so the donor email and the notice are marked `pending: delegation` in the Signups tab. Nothing is lost — once the admin-console step is done, run a backfill and the pending emails go out:

```
curl -s -H "x-dashboard-key: YOUR_CLUB78_ADMIN_KEY" "https://grunionrugby.com/.netlify/functions/club78-webhook?backfill=60&max=3" | python3 -m json.tool
```

Backfill = re-read the last N days of '78 Club payments from the Zeffy API and finish anything not fully processed (also catches payments made while the webhook was disabled). It handles `max` payments per call (keep ≤3 — the function has ~10 s); repeat until `remaining` is 0. Already-finished payments come back as `duplicate: true`.

Admin-console note: the sbrfc.com super-admin is **admin@sbrfc.com**, not treasurer@ — sign in as admin@ to see Security → API controls → Domain-wide delegation.

## Pushing a new approved copy deck

The live email copy is the `Emails` tab. `netlify/functions/club78-webhook.mjs` also carries the
same six templates as `DEFAULT_TEMPLATES` — the seed used when the tab is empty, and the copy of
record in git. To push the code version over the sheet (after Josh approves a new draft):

```
curl -s -H "x-dashboard-key: YOUR_CLUB78_ADMIN_KEY" "https://grunionrugby.com/.netlify/functions/club78-webhook?reseed=1&confirm=reseed" | python3 -m json.tool
```

**Destructive** — it overwrites whatever is in the tab, which is why it needs both `reseed=1` and `confirm=reseed` (without the second it only tells you so). Day-to-day tweaks should be made in the
sheet, not the code; only reseed when the code has been deliberately updated to a new deck.

## Test switches (with the admin key, on a simulate/dry POST)

| Flag | Effect |
| --- | --- |
| `"dry": true` | Nothing written, nothing sent. Returns the rendered email as `email_preview`. |
| `"no_plaque": true` | Runs for real but leaves the public Patron Wall untouched. |
| `"no_notify": true` | Suppresses the internal notice, so the donor email is the only mail sent. |

`no_plaque` + `no_notify` together is the safe way to send a test email to one person without
touching the live site or anyone else's inbox.

## Dry run without paying

**Use `"dry": true`** (not `"simulate": true`) unless you specifically want the test written through. A dry run walks the whole pipeline — tier maths, membership year, template rendering — and returns the exact email it *would* send, but **writes nothing to the public plaque and sends no mail**. It still logs a row in Signups (marked `dry run`) so the test is visible and deletable in one place.

`"simulate": true` does the same walk but writes for real: the plaque row appears on the live page within minutes. Only use it when you want a genuine end-to-end write, and delete the plaque row afterwards.


```
curl -s -X POST https://grunionrugby.com/.netlify/functions/club78-webhook \
  -H "content-type: application/json" -H "x-dashboard-key: YOUR_CLUB78_ADMIN_KEY" \
  -d '{"dry":true,"id":"sim-1","type":"payment.created","data":{"id":"sim-pay-1","amount":50000,"status":"succeeded","created":'"$(date +%s)"',"campaign_id":"bff55e80-4c68-40d9-9f72-d769d41697b3","campaign_category":"membership","description":"The 78 Club test","contact":null,"refund_status":"none","buyer":{"first_name":"Test","last_name":"Donor","email":"YOUR_EMAIL"},"buyer_questions":[],"items":[{"type":"ticket","amount":50000,"rate_id":null,"questions":[{"question":"Name for the 78 Club plaque","answer":"Test Donor (delete me)","type":"text"}]}]}}'
```

That sends the real Supporters' Union email to YOUR_EMAIL, adds "Test Donor (delete me)" to the plaque tab and logs a row — delete the plaque row and the log row afterwards. Only works with the admin key; Zeffy deliveries are always signature-checked.

## Real test, then go live

1. Netlify env vars set + redeployed; GET status all green.
2. Zeffy → the '78 form → Edit → temporarily set one tier's minimum to $1 (Membership options → Pay what you can → Min. price).
3. Zeffy → Settings → Integrations → Webhook → **Enable webhook**, tick the **`payment.created`** event (leave `payment.completed` unticked — the function ignores it anyway) → Save.
4. Pay $1 on the form with your own email. Within a minute: Zeffy receipt, then the tier email from treasurer@, the notice, a row in Signups, the name on the plaque tab (the live page updates ~5 min later).
5. Refund the $1 in Zeffy (Payments → the payment → Refund — free). Remove the test row from the Patron Wall tab and the Signups tab. Put the minimum back.

## What happens when Google is slow or down

- A failed read of the Signups log or the Emails tab **fails the run** (non-2xx). Zeffy retries the delivery (up to 5 times) with the log intact, so nothing is re-seeded or double-counted. Before this, a timeout was treated as an empty tab.
- A token error that is *not* the missing-delegation case (a Google 5xx, a timeout, a bad key) also fails the run instead of quietly parking the donor's email as `pending`.
- The whole run has a 9 s budget. If it runs out before the welcome email is sent, the run fails and Zeffy retries; nothing is sent twice.
- Right before sending, the row's `email_status` is written as `sending <tier> <time>`. If the function is cut off between the send and the `sent` write, the cell stays `sending` and a retry will **not** send again. GET status lists any row stuck in `sending` for more than 15 minutes under `stuck_sending`: check treasurer@'s Sent mail; if the email is not there, clear that cell in the Signups tab and run a backfill, which resends it.

## Gotchas

- Zeffy's own receipt still goes out first (generic thank-you, edited to say the tier email is coming). Its reply-to is the Zeffy org admin's address (org-wide setting).
- The webhook fires for every Zeffy payment (tile sponsorships, Chip In…); the function ignores what it should.
- Refunds do not send a webhook — refund a '78 payment and fix the sheet by hand.
- **Bank transfers (ACH) are welcomed before the money lands — on purpose.** Zeffy shows them as *Processing* for
  5–10 business days and only fires `payment.completed` when they settle; that is why the function listens to
  **`payment.created`** instead (Josh's decision, Sep 2 2026, after Gregory Smales's Founders' XV gift sat silent
  for an evening). The tier email — including the tax acknowledgment — the plaque row and the notice all go out at
  checkout, for cards and bank transfers alike. The trade-off: if a transfer later fails (bank decline, insufficient
  funds — Zeffy emails the org and the donor), the acknowledgment is already out and the name is on the plaque, so
  write to the donor and clean up the Signups tab and the Patron Wall tab by hand. No refund/failure webhook.
- Netlify secrets scanning: never put a secret value in a repo file.
- Plaque publishes ~5 minutes after the sheet changes (Google's published-CSV delay) — the emails say "on the plaque" without promising "right now".

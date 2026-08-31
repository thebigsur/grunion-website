# The '78 Club signup pipeline — setup & handbook

Built Aug 31 2026. Zeffy takes the money; this pipeline turns a payment into a
tiered member: welcome email from treasurer@sbrfc.com, name on the plaque,
internal notice, private log.

```
Donor → Zeffy '78 Club membership form ──payment.completed──▶ /.netlify/functions/club78-webhook
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
| `DASHBOARD_KEY` | Already set. Gates the GET status endpoint and the simulate harness. |
| `CLUB78_DISABLE_EMAIL` | Optional. `1` = log + plaque only, no emails (testing). |

Every secret's value also goes in the **Grunion Project Keys** doc (Grunion Private). Env changes need a redeploy to reach functions (Deploys → Trigger deploy).

## Rules the function follows

- **Only the '78 form creates members.** A payment on any other Zeffy donation form counts as a *top-up* if that email address already joined through the '78 form; events, shop and raffle payments never count.
- **Membership year** = 365 days from the first qualifying payment; the next payment after the year ends starts a new year. Everything inside the year is summed (Zeffy API history when the key is set, otherwise the Signups log).
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
curl -s -H "x-dashboard-key: YOUR_DASHBOARD_PASSCODE" https://grunionrugby.com/.netlify/functions/club78-webhook | python3 -m json.tool
```

Expected: `webhook_secret: true`, `zeffy_api_key: true`, `google_delegation: true`, six template keys, `patron_wall_tab: "'78 Club Patron Wall"`, and `club78_campaign.matches_config_id: true`. This call also creates the sheet tabs and seeds the templates, so run it once after the first deploy.

`google_delegation: false` with "unauthorized_client" = the domain-wide delegation step in the sbrfc.com admin console is missing or has the wrong scopes (needs exactly `https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/spreadsheets` on client id `104737401110086584512`).

## Dry run without paying

```
curl -s -X POST https://grunionrugby.com/.netlify/functions/club78-webhook \
  -H "content-type: application/json" -H "x-dashboard-key: YOUR_DASHBOARD_PASSCODE" \
  -d '{"simulate":true,"id":"sim-1","type":"payment.completed","data":{"id":"sim-pay-1","amount":50000,"status":"succeeded","created":'"$(date +%s)"',"campaign_id":"bff55e80-4c68-40d9-9f72-d769d41697b3","campaign_category":"membership","description":"The 78 Club test","contact":null,"refund_status":"none","buyer":{"first_name":"Test","last_name":"Donor","email":"YOUR_EMAIL"},"buyer_questions":[],"items":[{"type":"ticket","amount":50000,"rate_id":null,"questions":[{"question":"Name for the 78 Club plaque","answer":"Test Donor (delete me)","type":"text"}]}]}}'
```

That sends the real Supporters' Union email to YOUR_EMAIL, adds "Test Donor (delete me)" to the plaque tab and logs a row — delete the plaque row and the log row afterwards. Only works with the dashboard passcode; Zeffy deliveries are always signature-checked.

## Real test, then go live

1. Netlify env vars set + redeployed; GET status all green.
2. Zeffy → the '78 form → Edit → temporarily set one tier's minimum to $1 (Membership options → Pay what you can → Min. price).
3. Zeffy → Settings → Integrations → Webhook → **Enable webhook** → Save.
4. Pay $1 on the form with your own email. Within a minute: Zeffy receipt, then the tier email from treasurer@, the notice, a row in Signups, the name on the plaque tab (the live page updates ~5 min later).
5. Refund the $1 in Zeffy (Payments → the payment → Refund — free). Remove the test row from the Patron Wall tab and the Signups tab. Put the minimum back.

## Gotchas

- Zeffy's own receipt still goes out first (generic thank-you, edited to say the tier email is coming). Its reply-to is the Zeffy org admin's address (org-wide setting).
- The webhook fires for every Zeffy payment (tile sponsorships, Chip In…); the function ignores what it should.
- Refunds do not send a webhook — refund a '78 payment and fix the sheet by hand.
- Netlify secrets scanning: never put a secret value in a repo file.
- Plaque publishes ~5 minutes after the sheet changes (Google's published-CSV delay) — the emails say "on the plaque" without promising "right now".

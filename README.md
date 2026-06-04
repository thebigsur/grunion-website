# Grunion RFC Website

The official website for the Grunion Rugby Football Club, Santa Barbara.
Playing since 1978, founded 1980.

This is a plain static website — just HTML, CSS, and JavaScript files. There is
no build step and no database. To change the live site, change a file in this
repository; the host (Netlify) republishes automatically within about a minute.

---

## What's in here

| File / folder        | What it is |
|----------------------|------------|
| `index.html`         | The main homepage (hero, fixtures, play, history, news, sponsors, contact). |
| `the-78-club.html`   | The '78 Club legacy-donor program page. |
| `styles.css`         | All styling for both pages. |
| `site.js`            | All the page logic **and the CONFIG block** (see below). |
| `assets/`            | All images the site uses (logo, hero photo, gallery photos, sponsor logos). |
| `netlify.toml`       | Host configuration. Leave it alone. |

---

## The one place to set your links: CONFIG

Open `site.js`. The very top is a block called `CONFIG`. Every "connect this
later" link lives there — and only there. Fill in a value between the quote
marks and save. Nothing else in the file needs editing.

```
SHEET_CSV_URL          Match Centre fixtures — published Google Sheet (CSV)
PATRONS_DOC_URL        '78 Club patron wall — published Google Doc or Sheet
NEWSLETTER_ACTION_URL  Newsletter signup — Mailchimp/Buttondown form URL
JOIN_78_URL            "Join The '78 Club" button — payment/registration link
MEMBERS_AREA_URL       "Members Area" button — gated portal link
DONATE_URL             Footer "Donate Any Amount" button — payment link
SPONSOR_EMAIL          Where sponsorship inquiries are emailed
GIVING_NAME/EMAIL/PHONE  '78 Club giving-conversation contact
EIN                    Your 501(c)(3) EIN — shows in the footer + '78 Club page
```

Until a value is filled in, that button/section shows a friendly placeholder —
nothing looks broken.

---

## How to update things (no coding)

### Update fixtures & results
The Match Centre reads from a Google Sheet. Publish a sheet with these column
headers — `Season, Date, Opponent, Competition, Location, Status, GrunionScore,
OpponentScore` — then paste its published-CSV link into `SHEET_CSV_URL` in
`site.js`. After that, editing the sheet updates the site. No file changes.

### Update the '78 Club patron wall
Same idea: publish a Google Doc or Sheet of patron names by tier and paste its
link into `PATRONS_DOC_URL`. Editing that doc updates the wall.

### Update photos  ← you'll do this often
All images live in the `assets/` folder. To change one, upload a new image
**with the same filename**, replacing the old one. The site is already looking
for that name, so it updates automatically.

- `assets/grunion-crest.png` — the logo / crest
- `assets/hero-action.png` — the big homepage hero photo
- `assets/mermaids-team.png` — photo on the rugby-family section
- `assets/sharkeez-logo.png` — a sponsor logo
- `assets/history-1.jpg` … `assets/history-3.jpg` — the three club-life photos. These show in the History mosaic AND the Match Gallery below it (same three files power both).

For the gallery/history: just upload `history-1.jpg` through `history-3.jpg` to
`assets/`. Any slot without a matching file shows a labeled placeholder, so the
section never looks broken. (Use `.jpg`. If you must use `.png`, tell whoever
maintains the site so the references can be updated.)

### Everything else (wording, new sections, design)
Send the change to whoever maintains the site and they'll update the files.

---

## Hosting

Hosted on Netlify, connected to this GitHub repository. Any change pushed here
publishes automatically. See the launch checklist provided separately for the
one-time setup steps.

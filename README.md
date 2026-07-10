# Grunion RFC Website

The official website for the Grunion Rugby Football Club, Santa Barbara.
Playing since 1978, founded 1980. Live at https://grunionrugby.com

This is a plain static website — just HTML, CSS, and JavaScript files. There is
no build step and no database. To change the live site, change a file in this
repository; the host (Netlify) republishes automatically within about a minute.

---

## What's in here

| File / folder        | What it is |
|----------------------|------------|
| `index.html`         | The main homepage (hero, fixtures, gallery, sponsors, play, news, contact). |
| `the-78-club.html`   | The '78 Club legacy-donor program page. |
| `history.html`       | Club history — crest evolution, Hall of Fame, original team, constitution. |
| `MERchives.html`     | The MERchives — photo & document archive (pulls from Google Drive). |
| `fossils.html`       | The Central Coast Fossils retro page (deliberately styled like the 2000s site). |
| `404.html`           | The "page not found" page. |
| `styles.css`         | All styling for the modern pages. |
| `site.js`            | All the page logic **and the CONFIG block** (see below). |
| `assets/`            | All images the site uses (logo, hero photo, gallery photos, sponsor logos). |
| `netlify.toml`       | Host configuration (pretty URLs, caching). Leave it alone. |

---

## The one place to set your links: CONFIG

Open `site.js`. The very top is a block called `CONFIG`. Every "connect this
later" link lives there — and only there. Fill in a value between the quote
marks and save. Nothing else in the file needs editing.

```
SHEET_CSV_URL          Match Centre fixtures — published Google Sheet (CSV)
HOF_CSV_URL            Hall of Fame list (history page) — published Google Sheet (CSV)
PATRONS_DOC_URL        '78 Club patron wall — published Google Doc or Sheet
JOIN_78_URL            "Join The '78 Club" button — payment/registration link
DONATE_URL             Footer "Donate Any Amount" button — payment link
SPONSOR_EMAIL          Where sponsorship inquiries are emailed
GIVING_NAME/EMAIL/PHONE  '78 Club giving-conversation contact
EIN                    Your 501(c)(3) EIN — shows in the footer + '78 Club page
MEMBERS_DRIVE_*        MERchives — Google Drive API key + folder IDs
```

Until a value is filled in, that button/section shows a friendly placeholder —
nothing looks broken.

---

## How to update things (no coding)

### Update fixtures & results
The Match Centre reads from a Google Sheet. Publish a sheet with these column
headers — `Season, Division, Date, Time, Opponent, Competition, Location, Status,
GrunionScore, OpponentScore` — then paste its published-CSV link into
`SHEET_CSV_URL` in `site.js`. After that, editing the sheet updates the site.

Notes on the columns:
- `Time` is optional — e.g. `1:00 PM`. If filled in, upcoming matches show the
  kickoff time instead of "Kickoff TBD".
- `Location` should be `Home` or `Away`; anything else (e.g. `Neutral`) is
  shown exactly as written.

If Google can't be reached, the site shows the last-loaded results with a small
"Updated <date>" tag, or an honest "temporarily unavailable" note — it never
shows made-up fixtures.

### Update the Hall of Fame
Same idea: a published Google Sheet with `Name, Year` columns, linked via
`HOF_CSV_URL`. Editing the sheet updates the history page.

### Update the '78 Club patron wall
Publish a Google Doc or Sheet of patron names by tier and paste its link into
`PATRONS_DOC_URL`. Tier headings: Founders' XV / Second XV / Supporters' Union.

### Update the MERchives
Pure drag-and-drop in the shared Google Drive folder. Photos go in the season
sub-folders (Current Season / Prior Season / Legacy Photos); PDFs and Word docs
go loose in the top-level folder. The page updates automatically.

### Update photos  ← you'll do this often
All images live in the `assets/` folder. To change one, upload a new image
**with the same filename**, replacing the old one. The site is already looking
for that name, so it updates automatically.

- `assets/grunion-crest.png` — the logo / crest
- `assets/hero-action.jpg` — the big homepage hero photo (**.jpg**, not .png)
- `assets/mermaids-team.jpg` — photo on the rugby-family section (**.jpg**)
- `assets/stingrays-youth.jpg` — Stingrays photo on the rugby-family section (**.jpg**)
- `assets/history-1.jpg` … `assets/history-3.jpg` — gallery photos
- `assets/gallery-4.jpg` … `assets/gallery-6.jpg` — extra Match Gallery slots
- `assets/rincon-logo.png` / `assets/golden-rooster-logo.png` — sponsor logos
  (sponsor logos are served from this folder so a sponsor's own website can't
  silently break ours; if a file is missing the site falls back to the remote copy)

For the gallery: any slot without a matching file shows a labeled placeholder,
so the section never looks broken. Use `.jpg`. Please keep photos under about
300 KB — huge files slow the site down on phones. (Most phones can export a
smaller size, or use any free "compress image" tool.)

### Everything else (wording, new sections, design)
Send the change to whoever maintains the site and they'll update the files.

---

## Hosting

Hosted on Netlify, connected to this GitHub repository. Any change pushed here
publishes automatically. `netlify.toml` provides the pretty URLs
(/the-78-club, /MERchives, /history, /fossils) and asset caching.

One admin note: the Google Drive API key in `site.js` is public by design
(the browser needs it), but it must stay restricted in the Google Cloud
Console to the Drive API only **and** to the `grunionrugby.com` referrers, so
nobody else can use it. (Verified and locked down July 2026.)

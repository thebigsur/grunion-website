# Grunion RFC Website

This folder is a git clone of github.com/thebigsur/grunion-website.
The live site is hosted on Netlify and auto-deploys whenever changes
are pushed to the `main` branch.

## Architecture — keep it boring
Plain static HTML/CSS/JS. The repo is exactly what gets deployed — no build
step. Do NOT add a framework, package manager, build system, bundler, CMS,
or dependency unless Josh explicitly approves after hearing the maintenance
tradeoffs. Simplicity here is deliberate, not an accident.

## Files
- index.html — home page
- the-78-club.html — The '78 Club page
- history.html — club history page
- MERchives.html — photo & document archive (Google Drive-backed)
- fossils.html — Central Coast Fossils retro page
- thanks.html — newsletter confirmation page, retro Fossils style (Campaign Monitor redirects here)
- 404.html — not-found page
- styles.css — site styles (modern pages; retro pages carry their own inline CSS on purpose)
- site.js — site scripts + CONFIG block (all external links/IDs)
- netlify.toml — pretty URLs, caching & security headers
- robots.txt / sitemap.xml — SEO files (update sitemap if a page is added/removed)
- assets/ — images and other media

## Editing rules
- CONFIG at the top of site.js is the single source of truth for contacts,
  URLs, IDs, and keys. HTML uses data-* attributes filled at runtime.
  Config changes go in CONFIG only.
- Treat all Google Sheet/Drive text as untrusted: use textContent, or run it
  through esc() before any innerHTML interpolation.
- Never render sample/placeholder data as if it were real. Keep the honest
  "temporarily unavailable" states and the "Updated <date>" cache tag.
- The Google Sheets/Drive no-code editing workflow is the core design. Do not
  replace it with build pipelines, snapshot generators, or serverless functions
  unless live delivery has actually proven unreliable.
- Images: compress before committing (target <300KB; palette-quantized PNG works
  well for the crest artwork), keep the same-filename replacement convention,
  and give every new <img> width/height attributes (+ loading="lazy" below the fold).
- Sponsor images are served from assets/ with a remote onerror fallback —
  keep sponsor logos local; don't reintroduce hotlinks.
- The Campaign Monitor archive script uses document.write. It must stay inline
  exactly where it is in index.html — never add async/defer to it.
- Retro pages (fossils.html, thanks.html) are deliberately styled like the
  2000s site — don't modernize them.
- Header/footer markup is duplicated across the modern pages by design. A shared
  change must be applied to index, history, MERchives, the-78-club, and 404.
- Don't change donation/tax wording (EIN, 501(c)(3), deductibility) without
  flagging it for Josh to review.
- Don't rotate or swap API keys, Drive folder IDs, or external service URLs
  without calling out the impact first. The Drive API key in site.js is public
  by design and restricted in Google Cloud Console (Drive API only +
  grunionrugby.com referrers — verified July 2026).

## Workflow when I ask you to update the site
1. Before editing, run `git pull` to make sure the local copy is current
   (I sometimes edit files directly on GitHub's website).
2. Edit the relevant file(s) in place.
3. Verify before showing me anything:
   - `node --check site.js` passes
   - every local href/src referenced in HTML exists in the repo
   - the change is applied to every page it affects
4. Show me a summary of what changed and let me review.
5. The sandbox can commit but cannot push (no GitHub credentials), and can
   leave stale .git lock files behind. After I approve, commit, then give me
   copy-paste terminal commands that remove stale lock files and push:
   ```
   cd ~/Documents/grunion-website
   rm -f .git/index.lock .git/refs/heads/main.lock
   git push origin main
   ```
6. Tell me Netlify will redeploy automatically (usually under a minute), and
   include the previous commit hash so we can `git revert` if needed.

## Notes
- Always pause for my approval before pushing — don't push automatically.
- Keep commit messages short and descriptive.

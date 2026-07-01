# Grunion RFC Website

This folder is a git clone of github.com/thebigsur/grunion-website.
The live site is hosted on Netlify and auto-deploys whenever changes
are pushed to the `main` branch.

## Files
- index.html — home page
- the-78-club.html — The '78 Club page
- history.html — club history page
- MERchives.html — photo & document archive (Google Drive-backed)
- fossils.html — Central Coast Fossils retro page
- thanks.html — newsletter confirmation page, retro Fossils style (Campaign Monitor redirects here)
- 404.html — not-found page
- styles.css — site styles
- site.js — site scripts + CONFIG block (all external links/IDs)
- netlify.toml — pretty URLs & caching
- assets/ — images and other media

## Workflow when I ask you to update the site
1. Before editing, run `git pull` to make sure the local copy is current
   (I sometimes edit files directly on GitHub's website).
2. Edit the relevant file(s) in place.
3. Show me a summary of what changed and let me review before committing.
4. Once I confirm, run:
   git add -A
   git commit -m "<short description of the change>"
   git push origin main
5. Tell me Netlify will redeploy automatically (usually under a minute).

## Notes
- Always pause for my approval before pushing — don't push automatically.
- Keep commit messages short and descriptive.

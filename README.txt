AKIBA SMART PWA
A service worker needs http(s) (or localhost); it will not run from a double-clicked file.
Test locally:   cd akiba-smart-pwa && python3 -m http.server 8080  -> open http://localhost:8080
Deploy:         upload this whole folder to any HTTPS host (Netlify, Cloudflare Pages, GitHub Pages).
Then open the URL on the phone: Chrome shows "Install app" (or menu > Add to Home screen); on iPhone use Safari > Share > Add to Home Screen.
After first load it works fully offline. Bump VERSION in sw.js whenever you change index.html.

--- v6: committee workflow (officers only, no member accounts) ---
Only the Chairman, Treasurer and Secretary log in. Members take part through WhatsApp.
Files: index.html (app), committee.js (workflow, import, reports), parse.js (bank-message reader), pdf.js (PDF writer), sw.js (offline).
Existing saved data upgrades itself the first time v6 opens. Use Settings > Export data first if you want a backup.

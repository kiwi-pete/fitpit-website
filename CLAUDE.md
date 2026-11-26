# Fit Pit Website — Project Notes

## Deployment workflow (standing instruction)

The owner wants **every change deployed to production automatically**. After
making any code change:

1. Commit the change with a clear message.
2. Push the working branch.
3. Merge the change into `main` and push `main`.
4. Pushing `main` triggers a **Vercel production rebuild/deploy** via the
   GitHub git integration (project: `fitpit-website`, team `kiwipete`). The
   live site is https://www.fitpitznz.com.
5. Confirm the production deployment was triggered (state `BUILDING` →
   `READY`, `target: production`).

Do this without waiting for a separate "deploy now" request — the owner has
given blanket, durable permission to push to `main` and deploy to production.
The previous production deployment is always available as a one-click rollback
candidate in Vercel if something looks wrong.

## Stack / deploy facts

- Static site built with **Vite** (`npm run build` → `dist/`). Config in
  `vercel.json` (framework: vite, output: `dist`).
- Vercel deploys are driven by **git push to `main`** (no Vercel CLI/token is
  available in the web session; the deploy tool only returns instructions).
- Entry points: `index.html`, `main.js`, `style.css`. Serverless API in `api/`.

## Website Content editor (WYSIWYG)

- The admin (`/secretadminlink` → "Website Content" tab) embeds the live site
  in an `<iframe src="/?edit=1">`. Editable elements in `index.html` are marked
  with `data-edit="<key>"` (text) / `data-edit-img="<key>"` (images). Edits are
  stored as overrides in the dedicated Supabase table `web_site_content`
  (`api/content.js`) and re-applied on every page load by `applyContentOverrides`
  in `main.js`. Edit-mode logic is the lazy chunk `siteedit.js`. Replaced photos
  upload via `api/upload.js` (`folder: 'site-images'`).
- The editor relies on **same-origin iframing** of the site inside the admin. Do
  NOT add `X-Frame-Options: DENY/SAMEORIGIN` to `vercel.json`; if a CSP is ever
  needed, use `Content-Security-Policy: frame-ancestors 'self'` instead.
- Never annotate dynamic regions with `data-edit`: the `#class-schedule` grid,
  `#footer-year`, and the membership-agreement modal are intentionally excluded.

## Membership sign-up form (QR code / `/join`) on a weak connection

- The whole sign-up (details, signature, ID photo) is one JSON request to
  `api/submit-agreement.js`, and **Vercel refuses any request over 4.5 MB**. So the ID
  photo is always shrunk in the browser first (`prepareIdFile` in `signup-upload.js`:
  longest side 2000px JPEG, stepping down until it is about 1.2 MB). Never send a
  photo as the camera took it. PDFs can't be shrunk and are capped at 2.5 MB.
- **The photo ID is optional.** "Skip for now" on the ID step, or "Send without ID
  photo" after a failed send, submits without it. The member record's Comments and
  the email to the desk then say no ID was uploaded, so the desk checks it and adds
  it to the profile in Gym Manager.
- `postAgreement` retries a dropped send (3 tries) and reports failures with a code
  the form turns into plain words (`submitFailureMessage`). "Try Again" re-sends the
  same form; nothing is re-entered.
- Each time the form opens it gets a `submission_id` (a UUID) that becomes the new
  member's id. A re-send of the same form is recognised by that id
  (`already_submitted` in `api/_gym-manager.js`) — no second member, no second
  round of emails. Keep it if the form is reworked, or retries will duplicate.

## CSS / responsive notes

- `style.css` is a single large stylesheet. **Responsive media-query overrides
  live at the END of the file** ("Responsive overrides (kept at END of file)"
  block). Keep new mobile collapse rules there — media queries do not add
  specificity, so they must come after component base styles to win on source
  order. (A previous bug had them mid-file, which left lower-page sections
  stuck multi-column on mobile.)
- Mobile spacing is tightened by overriding spacing custom properties inside a
  `@media (max-width: 768px) { :root { ... } }` block so inline styles that
  reference those variables shrink too.
- `html, body` use `overflow-x: hidden` + width constraints to stop sideways
  scrolling on iOS Safari.

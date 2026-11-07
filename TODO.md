# gullhacks26-Infra (Fix Please) — TODO

Phone-first web app: snap a photo of broken infrastructure, pin the spot, and get who is responsible plus a ready-to-send email with the photo attached. No accounts, no database; the user sends the email themselves.

The original plan (a public report database with tracking codes, a browse map, and statuses) was replaced by the current no-database design. Items from that plan that conflict with it are listed under [Dropped](#dropped-from-the-original-plan).

**Status (2026-11-07, `474b0ba`)**
- 57/57 tests pass (`node --import tsx --test server/*.test.ts src/lib/*.test.ts`)
- `tsc --noEmit` passes
- `vite build` succeeds, with a warning that the single JS chunk is 649 kB (206 kB gzip)
- **Domain acquired:** `fixplease.work`, registered at Porkbun on 2026-11-07 (renews 2027-11-07), using Porkbun nameservers. It currently shows Porkbun's "Coming Soon" parked page over HTTP (apex and `www` resolve to 207.207.210.107 / .229), with no HTTPS.
- Not deployed yet. The app's name, header, OG tags, README, and `submission/` already use `fixplease.work`.
- No CI: the repo has no `.github/`
- No deploy CLIs on the dev laptop (`flyctl`, `railway`, `docker`, `cloudflared` not installed)

**Priority legend**
- **P0**: required for judging and the demo
- **P1**: should have; fixes honesty or polish gaps a judge could notice
- **P2**: stretch

---

## Open — P0

### Launch on fixplease.work (in order)

- [ ] **Pick the host.** It needs one long-lived Node 24 process. The bot check and rate limits live in memory, so run exactly one instance. Avoid free tiers that sleep when idle: the first visitor after a nap waits through a cold start. Options: Render (Starter), Railway, Fly.io, or a small VM with Caddy for automatic TLS. Whoever owns the account adds the team.
- [ ] **Production Gemini key.** Create a dedicated key in a billed project with Search grounding enabled (search grounding is a paid-tier feature). Set a budget alert or spending cap: anyone who loads the public site can spend from it, within the rate limits.
- [ ] **Deploy.** Build with `npm ci && npm run build`, start with `npm start`. Environment:
  - `GEMINI_API_KEY`: the production key, set in the host's secret settings only
  - `HOST=0.0.0.0`, and `PORT` from the host if it assigns one
  - `TRUST_PROXY=1`, or the real number of proxy hops, so rate limits see visitor IPs
  - `GEOCODER_USER_AGENT=FixPlease/1.0 (+https://fixplease.work; <contact email>)`: the OSM usage policy requires a real contact
  - `RESEARCH_RATE_LIMIT`: raise it for demo day (see below)
  - `CAPTCHA_SECRET`: optional; a long random value
- [ ] **DNS at Porkbun.** Delete the parked-page records for the apex and `www`, then add the records the host gives you: usually ALIAS/A for `fixplease.work` and CNAME for `www`. Make the apex canonical and redirect `www` to it.
- [ ] **HTTPS.** Let the host issue certificates for `fixplease.work` and `www.fixplease.work` and force HTTP→HTTPS. Camera capture, "I'm standing here", and the bot check all need HTTPS. Add HSTS only after HTTPS has worked for a while.
- [ ] **Keep the Host header intact.** `/api/investigate` rejects any request whose `Origin` host doesn't match the `Host` header (`server/index.ts` L112–119). A proxy or CDN that rewrites `Host` breaks report generation while everything else still looks fine.
- [ ] **Smoke test on the live domain**:
  - `https://fixplease.work/api/health` shows `researchConfigured: true`
  - Address search and pin context load
  - One full report end to end
  - `http://` and `www` redirect to `https://fixplease.work`
  - No console errors
- [ ] **Point docs at the live URL.** In the README, "Try it on your phone" becomes "open https://fixplease.work", and the tunnel becomes a local-only fallback. Add host-specific steps to Deploy. Add the live link to `submission/submission.md`.
- [ ] **Demo rate limit.** Set `RESEARCH_RATE_LIMIT` well above the default of 5 per 15 min per IP. Everyone on venue Wi-Fi shares one IP.

### App and demo

- [ ] **Header overflows on phones.** At a 390 px viewport the header is about 489 px wide (wordmark, CIVIC AI badge, grounding pill, Privacy link), so the page scrolls sideways. This is phone-first, and judges will open it on phones. Fit it at 360–390 px, e.g. hide the badge, shorten the pill, or move Privacy to the footer.
- [ ] **ResultView fallback organization makes up names** (`src/components/ResultView.tsx` L32–44). When the model returns no organization, the UI builds `City of <address.city> Public Works`, `<county> Department of Public Works`, or `Local Public Works & Roads Department`, and adds a reason sentence saying it is "the best point of contact". Problems:
  - It reads `location.address.city` (Nominatim town/village/city) instead of `context.place.municipality`. An unincorporated place can therefore become a "City of X" that doesn't exist. The research prompt already uses `municipality === null` to mean "county".
  - The `address.county` cast is dead code: `LocationAddress` and `server/geocoder.ts` never set `county`.
  - It contradicts README "Why you can trust the result" and the submission's claim that a plausible answer is never presented as ownership.

  Fix: show the municipality/county facts from `context` without invented department names, or say plainly that the office couldn't be identified.
- [ ] **Real-device pass on iPhone Safari and Android Chrome**, on https://fixplease.work:
  - Take a photo (rear camera) and From your library
  - Confirm iPhone photos arrive as JPEG; `PhotoInput` rejects HEIC
  - "I'm standing here" permission prompt and the denied path
  - Send with photo share sheet
  - Add to Home Screen
- [ ] **Manual QA of failure paths:**
  - Location denied
  - Map tiles failing
  - No Gemini key (offline banner)
  - Rate-limit message
  - Cancel investigation
  - Slow network
  - No console errors through the demo flow
- [ ] **Record the video** from `submission/video-script.md` (~2:30, one real issue, no staged evidence).
- [ ] **Record a backup** of the full flow in case Wi-Fi or geolocation fails on stage.
- [ ] **Submit to Devpost** using `submission/submission.md`; add team members.
- [ ] **README:** add screenshots or a GIF and team members.

## Open — P1

- [ ] **Domain email.** Set up Porkbun email forwarding for something like `hello@fixplease.work`. Use it in `GEOCODER_USER_AGENT` and as the contact on the site and in the submission.
- [ ] **Share previews and canonical URL** (`index.html`): add `<link rel="canonical" href="https://fixplease.work/">`, `og:url`, and an `og:image` so links posted in chats and Devpost show a card.
- [ ] **UI copy overclaims compared with the app's actual behavior** (`src/App.tsx`):
  - The "AI Grounding Active" pill (L212–215) shows even when `/api/health` reports no key and the offline banner is up.
  - "**Dispatch** our AI-drafted report to the right team" (L247) implies the app sends; it never does.
  - "searches live municipal records, highway divisions, and HOA registries" (L243) and the "Searching municipal portals & HOA registries" stage (L62) describe sources the server doesn't query. It uses Google Search grounding plus OSM, Overpass, and Census context.
  - The contact fallback says "dial your city 311 service" (`ResultView.tsx` L141); 311 isn't universal.
- [ ] **No "not for emergencies" notice in the UI.** README and submission say "Not for emergencies", but nothing in `src/` says so; only model-generated warnings may mention 911. Add a line near the submit button or in the Privacy dialog.
- [ ] **Accessibility audit:**
  - axe + Lighthouse (target ≥ 95)
  - Keyboard-only run: photo → search/coordinates → "Yes, it's here" → result → email actions
  - Screen-reader pass on the flow
- [ ] **CI:** add a GitHub Actions workflow for `npm ci` → `npm test` → `npm run build`. The remote is `github.com/killerfrost22/gullhacks26-Infra`.
- [ ] **Bundle size:** lazy-load Leaflet / `LocationPicker`. It's only needed after a photo is chosen, so the landing page shouldn't pay for it.

## Open — P2

- [ ] For sustained public traffic, move off the public OSM tile server, Nominatim, and Overpass (usage policies), or self-host them. `NOMINATIM_BASE_URL` and `OVERPASS_URL` already make that a config change; tiles are hard-coded in `LocationPicker`.
- [ ] HEIC on desktop: convert it (e.g. `heic2any`) instead of rejecting it.
- [ ] More than one photo per report (currently exactly one).
- [ ] Service worker for the app shell (the manifest and icons already exist).
- [ ] Component / end-to-end tests. Current tests cover `server/` and `src/lib/` only.
- [ ] Shared store for rate limits and captcha replay state, so more than one instance can run. Both are in memory now.

---

## Done

### Stack & project
- [x] React 19 + Vite 8 + TypeScript frontend; Express 5 API in the same package.
- [x] `npm run dev` runs both, with Vite proxying `/api` to `PORT`.
- [x] Shared request/response types in `shared/types.ts` (replaces the draft API contract). Errors are always `{ error, code }`.
- [x] Scripts:
  - `dev`
  - `build` (`tsc --noEmit` + `vite build`)
  - `start` (serves `dist/` + API, with SPA fallback)
  - `test`
- [x] `.env.example` keeps secrets server-side only; `.gitignore` covers `node_modules/`, `dist/`, `.env*`.

### 1. Photo
- [x] Touch devices get "Take a photo" (`capture="environment"`) and "From your library"; desktop gets drag-and-drop or "Choose a photo".
- [x] Magic-byte type check (JPEG / PNG / WebP), 15 MB cap, inline errors; Replace / Retake / Remove.
- [x] On-device resize to 1920 px and JPEG re-encode, which strips EXIF. Quality steps down until it fits the 6 MB request limit.
- [x] EXIF GPS read with `exifr` suggests the pin; the user still has to confirm.

### 2. Location
- [x] Location sources:
  - Photo GPS
  - "I'm standing here" (HTTPS check; separate denied / timeout / unavailable messages; accuracy shown in metres)
  - Address search on submit (server-proxied Nominatim, no type-ahead)
  - Tap or drag the pin
  - Manual coordinates
- [x] Reverse-geocoded label; "Yes, it's here" confirmation is required before continuing.
- [x] OSM attribution on the map and in the footer.
- [x] Map facts for the pin, shown as context chips:
  - Road and route number
  - Campus and its website
  - Mapped streetlights and their operator
  - Municipality / county

  Sources: Overpass, Census, with Nominatim as the fallback. Cached for 15 min.

### 3. Details
- [x] Optional clue box (1500 chars, counter near the limit) with quick-clue chips: HOA, property manager, pole number, landmark.

### 4. Investigation (server)
- [x] `POST /api/investigate` runs two Gemini calls: research with Google Search grounding and URL context, then a Zod-structured formatting call.
- [x] Evidence checks:
  - Search redirects are resolved
  - Cited pages must actually load
  - `source_supported` requires the coverage quote to appear word for word on the page
  - Email and phone must be published on an official page
  - Unsupported certainty is downgraded

  The server retries once if a response is blocked for recitation.
- [x] Abuse controls:
  - ALTCHA proof-of-work
  - Rate limits: research 5 per 15 min, location 30/min, captcha 20/min
  - Same-origin check and 6 MB JSON limit
  - `TRUST_PROXY` support
- [x] `GET /api/health` drives the "lookup offline" banner.

### 5. Result & handoff
- [x] Verdict chip: Verified on Official Site / Best Match / Best Guess. Also shows the organization, department, reason, contacts with a source link, and the official site or report-form link.
- [x] Editable To / Subject / Message, with four ways out:
  - Send with photo (Web Share with files, on touch)
  - Download `.eml` with the photo attached
  - Mail app (`mailto:`)
  - Copy
- [x] "Before you send" warnings, "How we know" source list, and Google search suggestions sanitized with DOMPurify.
- [x] During the request: progress stages and Cancel. Errors get plain-language messages per error code. A stale captcha is retried once automatically.

### Privacy, accessibility, mobile
- [x] Privacy & Transparency dialog: what is sent to Gemini (including the 30-day retention), nothing stored, OSM requests, bot check, user sends the email.
- [x] Skip link, labelled fields, `role="alert"` / `aria-live` status regions, `:focus-visible` rings, `prefers-reduced-motion`, and focus moves to the result heading.
- [x] Mobile-first CSS with coarse/fine pointer variants and safe-area insets.
- [x] Web app manifest and icons, so it can be installed to the home screen.

### Tests & docs
- [x] 57 `node:test` tests covering the API, captcha, context, Gemini client/response, geocoder, provenance, research, and email draft/`.eml` output.
- [x] README covers local run, phone demo through a tunnel, deploy, env vars, privacy, API, and checks.
- [x] `submission/submission.md` (Devpost write-up) and `submission/video-script.md`.

---

## Dropped from the original plan

These conflict with the no-accounts / no-database design or were superseded by what was built.

- Report storage, tracking codes, success page, `/track`, "My reports", upvotes, comments, status timeline, admin dashboard.
- Public map of reports: markers, filters, clustering, heatmap, detail pages, duplicate detection, live stats, recent-reports strip.
- Category / subcategory / severity pickers and the 4-step wizard (React Hook Form + per-step Zod). Gemini classifies from the photo, and the page is a single progressive flow.
- TanStack Query, MSW mocks, Tailwind, ESLint/Prettier. The app uses plain `fetch` and plain CSS against the real API.
- Reporter contact fields, anonymous toggle, and the public-photo consent checkbox. Nothing is published, and the user sends from their own account.
- Turnstile / hCaptcha: replaced by self-hosted ALTCHA.
- Offline queue and draft persistence: state lives only in the page, by design ("close the tab and it's gone").
- Per-section owners and feature-branch PR workflow: the app was migrated in as a single commit.

---

## Definition of Done (demo)

- [x] A user can photograph an issue, set the location (photo GPS, device, search, or pin), add a note, and get the responsible office plus an editable email with the photo attached.
- [ ] Live at https://fixplease.work over HTTPS (with `www` and `http://` redirecting).
- [ ] Verified on iOS Safari and Android Chrome.
- [ ] Fallback organization no longer makes up office names.
- [ ] Flow is usable keyboard-only.
- [ ] No console errors in the demo flow.

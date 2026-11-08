# gullhacks26-Infra (Fix Please) — TODO

Phone-first web app: snap a photo of broken infrastructure, pin the spot, and get who is responsible plus a ready-to-send email with the photo attached. No accounts, no database; the user sends the email themselves.

The original plan (a public report database with tracking codes, a browse map, and statuses) was replaced by the current no-database design. Items from that plan that conflict with it are listed under [Dropped](#dropped-from-the-original-plan).

**Rebuild (2026-11-07).** GullHacks rules forbid code written before the event, and the first version of the app was a pre-event prototype. Starting after hacking opened (Saturday, Nov 7, 12:00), the whole app was rewritten from scratch on branch `feat/rebuild`: new server, new client, new visual identity, same product and API. The prototype's code was deleted, not reused.

**Status (2026-11-07, `feat/rebuild`)**
- 176/176 tests pass (`npm test`); `tsc --noEmit` and `vite build` are clean.
- First-load JS is 93.8 kB gzip (80 kB with Brotli, which the server now sends). Leaflet (45 kB), exifr, DOMPurify, and the HEIC decoder (heic-to, 809 kB) load only when needed. 2 font files on first load.
- Lighthouse mobile on the production build: Performance 98, Accessibility 100, Best Practices 100, LCP 2.0–2.1 s, CLS ≤ 0.037 on `/`, `/tech`, `/privacy`. Measured just before the last two UI fixes (numbered search results, search-suggestions width); re-run before the demo.
- axe: no violations on every page and every flow state (dev scene harness), at 375 and 1440 px.
- Live end-to-end on the production build, `gemini-3.6-flash` (the default since `7d92769`): photo → search → pin → note → report in 22 s, "Best match" (University of Maryland Facilities Management), report form and phone verified on facilities.umd.edu, no console errors. An earlier run on `gemini-3.5-flash-lite` took 16 s, named Maryland SHA, and downloaded an `.eml` with the photo attached and no EXIF. Same spot, two different offices, both "Best match": another reason to find a demo spot that reaches "Confirmed".
- **Domain acquired:** `fixplease.work`, registered at Porkbun on 2026-11-07 (renews 2027-11-07), using Porkbun nameservers. It still shows Porkbun's parked page over HTTP, with no HTTPS.
- Not deployed. No CI (no `.github/`). No deploy CLIs on the dev laptop (`flyctl`, `railway`, `docker`, `cloudflared`).

**Priority legend**
- **P0**: required for judging and the demo
- **P1**: should have; fixes honesty or polish gaps a judge could notice
- **P2**: stretch

---

## Open — P0

### Merge the rebuild

- [ ] **Review and merge `feat/rebuild`.** One teammate reviews, then merge into `main`. Nothing from the rebuild has been pushed yet.

### Launch on fixplease.work (in order)

- [ ] **Pick the host.** It needs one long-lived Node 24 process. The bot check and rate limits live in memory, so run exactly one instance. Avoid free tiers that sleep when idle: the first visitor after a nap waits through a cold start. Options: Render (Starter), Railway, Fly.io, or a small VM with Caddy for automatic TLS. Whoever owns the account adds the team.
- [ ] **Production Gemini key.** Create a dedicated key in a billed project with Search grounding enabled (search grounding is a paid-tier feature). Set a budget alert or spending cap: anyone who loads the public site can spend from it, within the rate limits.
- [ ] **Deploy.** Build with `npm ci && npm run build`, start with `npm start`. Environment:
  - `GEMINI_API_KEY`: the production key, set in the host's secret settings only
  - `HOST=0.0.0.0`, and `PORT` from the host if it assigns one
  - `TRUST_PROXY=1`, or the real number of proxy hops, so rate limits see visitor IPs
  - `GEOCODER_USER_AGENT=FixPlease/2.0 (+https://fixplease.work; <contact email>)`: the OSM usage policy requires a real contact
  - `OVERPASS_URL`: a working Overpass instance (see P1)
  - `RESEARCH_RATE_LIMIT`: raise it for demo day (see below)
  - `CAPTCHA_SECRET`: optional; a long random value
- [ ] **DNS at Porkbun.** Delete the parked-page records for the apex and `www`, then add the records the host gives you: usually ALIAS/A for `fixplease.work` and CNAME for `www`. Make the apex canonical and redirect `www` to it.
- [ ] **HTTPS.** Let the host issue certificates for `fixplease.work` and `www.fixplease.work` and force HTTP→HTTPS. Camera capture, "I'm standing here", and the bot check all need HTTPS. Add HSTS only after HTTPS has worked for a while.
- [ ] **Keep the Host header intact.** `/api/investigate` rejects any request whose `Origin` host doesn't match the `Host` header (`isSameOrigin` in `server/app.ts`). A proxy or CDN that rewrites `Host` breaks report generation while everything else still looks fine.
- [ ] **Smoke test on the live domain**:
  - `https://fixplease.work/api/health` shows `researchConfigured: true`
  - Address search and pin context load
  - One full report end to end
  - `http://` and `www` redirect to `https://fixplease.work`
  - No console errors
- [ ] **Point docs at the live URL.** In the README, "Try it on your phone" becomes "open https://fixplease.work", and the tunnel becomes a local-only fallback. Add host-specific steps to Deploy. Add the live link to `submission/submission.md`.
- [ ] **Demo rate limit.** Set `RESEARCH_RATE_LIMIT` well above the default of 5 per 15 min per IP. Everyone on venue Wi-Fi shares one IP.

### App and demo

- [ ] **Real-device pass on iPhone Safari and Android Chrome**, on https://fixplease.work:
  - Take a photo (rear camera) and From your library
  - Confirm iPhone HEIC photos open from the library and the camera (Safari decodes them natively), and that a HEIC on Android Chrome converts through heic-to
  - "I'm standing here" permission prompt and the denied path
  - Send with photo share sheet
  - Add to Home Screen
  - Bot-check solve time on a mid-range phone (about 0.25 s on the dev desktop)
- [ ] **Manual QA of failure paths:**
  - Location denied
  - Map tiles failing
  - No Gemini key (offline banner)
  - Rate-limit message
  - Cancel investigation
  - Slow network
  - No console errors through the demo flow
- [ ] **Find a demo spot that reaches "Confirmed on an official site".** Test runs so far ended at "Best match". Try a few spots on numbered state routes, where the state road agency publishes which roads it maintains.
- [ ] **Record the video** from `submission/video-script.md` (~2:30, one real issue, no staged evidence).
- [ ] **Record a backup** of the full flow in case Wi-Fi or geolocation fails on stage.
- [ ] **Submit to Devpost** using `submission/submission.md`; add team members.
- [ ] **README:** add screenshots or a GIF and team members.

## Open — P1

- [ ] **Overpass is unreliable.** The public `overpass-api.de` returned 502s and timeouts all afternoon on Nov 7, and two mirrors timed out too, so road, route-number, campus, and streetlight facts were missing (context marked partial; Census and Nominatim still answered). Point `OVERPASS_URL` at an instance that answers, or self-host, before the demo.
- [ ] **Domain email.** Set up Porkbun email forwarding for something like `hello@fixplease.work`. Use it in `GEOCODER_USER_AGENT` and as the contact on the site and in the submission.
- [ ] **Screen-reader pass** (VoiceOver on iPhone, NVDA on Windows) through the whole flow. Automated checks are in the Status block.
- [ ] **CI:** add a GitHub Actions workflow for `npm ci` → `npm test` → `npm run build`. The remote is `github.com/killerfrost22/gullhacks26-Infra`.
- [ ] **Campus fallback is weak.** When Overpass fails, the campus comes from Nominatim's reverse lookup, which finds it only if the mapped object at the pin is the university itself (at the UMD pin it returned a ChargePoint charger).
- [ ] **"Best match" reasons can sound certain.** In the live test the reason read "Because this segment is designated as a state-maintained roadway…" under a "Best match" stamp, with no page proving it. The stamp and the "Before you send" warning flag it, but the format prompt in `server/research/prompt.ts` should ask for hedged wording ("likely", "appears to") when the verdict isn't confirmed.
- [ ] **Search markers overlap on phones.** At 375 px, results close together overlap on the map. The highlighted one draws on top and the numbered list still works; consider clustering or offsetting.

## Open — P2

- [ ] **Real progress while a report runs.** The request is a single call with no progress events, so the screen lists what happens without claiming which step is running. Stream stage events from the server (e.g. SSE) to show real progress.
- [ ] Google's search-suggestion chips are 32 px tall at 768 px and up (under our 44 px target) and follow the device's dark mode on our light page. Google's terms require showing them unchanged, so this can only change if Google's markup does.
- [ ] For sustained public traffic, move off the public OSM tile server, Nominatim, and Overpass (usage policies), or self-host them. `NOMINATIM_BASE_URL` and `OVERPASS_URL` already make that a config change; tiles are hard-coded in `src/flow/PinMap.tsx`.
- [ ] More than one photo per report (currently exactly one).
- [ ] Service worker for the app shell (the manifest and icons already exist).
- [ ] Component / end-to-end tests. Current tests cover `server/` and `src/lib/` only.
- [ ] Shared store for rate limits and captcha replay state, so more than one instance can run. Both are in memory now.

---

## Done (rebuild)

### Stack & project
- [x] React 19 + Vite 8 + TypeScript (strict) client; Express 5 API in the same package. Shared request/response types in `shared/types.ts`; errors are always `{ error, code }` with a fixed code list.
- [x] Scripts: `dev` (API + Vite, `/api` proxied with the Host header kept), `build` (`tsc --noEmit` + `vite build`), `start` (serves `dist/` + API with SPA fallback and Brotli/gzip), `test`.
- [x] Credits for every framework, font, and data source in the README (GullHacks rule).

### Server
- [x] Map facts (`server/geo/`): Overpass nearest road and route number, campus, street lamps (60 s backoff after failures); U.S. Census incorporated place or active town/township, with its type ("Town of University Park"); Nominatim search and reverse (one request per second, cached) and fallback. 9 s cap; failures mark the context partial instead of erroring.
- [x] Research (`server/research/`): Gemini Interactions API with Google Search grounding and URL context, then a Zod-structured format call; `store: false`; 45 s budget; recitation retry capped at "Best match".
- [x] Evidence rules: pages load through an SSRF-safe fetcher (public addresses only, pinned DNS, size and time limits); "Confirmed" needs the quote word for word on a loaded official page; "Best match" needs at least one loaded official source, otherwise the office is "unidentified" and nothing is invented; contacts only from official pages, repair/service inboxes on the office's own domain, never personal, press, HR, or webmaster addresses; free text stripped of unverified contacts and links.
- [x] HTTP (`server/app.ts`): same-origin check, single-use ALTCHA proof of work, per-IP rate limits (research 5 per 15 min, locations 30/min each, captcha 20/min), 6 MB limit on reports and 16 kB elsewhere, security headers, `no-store` on the API, Brotli/gzip for `dist/`, clear port-in-use message.

### Client
- [x] New identity: "the street and the paperwork" (asphalt column, paper sheet, survey-paint orange), Big Shoulders + Public Sans (self-hosted variable fonts), a stamp for the verdict, and survey-paint rings: the wordmark circles FIX the way the headline circles "broken", and a hand-sprayed loop around a spot is the favicon, app icon, and map pin.
- [x] Report flow on one page: photo (camera, library, drag-and-drop; HEIC converted on the device, natively in Safari and via heic-to elsewhere; on-device resize and metadata strip; GPS suggestion), pin (Leaflet loaded on demand; photo GPS, device location, address search, tap/drag, manual coordinates; "Yes, it's here" required; map-fact chips), note (1,500 chars, quick clues), report, result.
- [x] Result: "Confirmed on an official site" / "Best match. Worth a quick check." / "We couldn't identify the office" (map facts only); evidence quote, contacts with source links, reporting page, "Before you send" warnings, "How we know" sources, Google search suggestions in a shadow root; editable email with Send with photo (Web Share), Download email (`.eml` with the photo), Open mail app, Copy.
- [x] `/tech` and `/privacy` pages; "not for emergencies" notice in the footer and near the submit button; OSM attribution; no AI-active claims when the key is missing.
- [x] Canonical URL, Open Graph/Twitter tags with a 1200×630 share image, manifest and icons.
- [x] Fixed from the prototype's TODO: phone header overflow, invented fallback office names, overclaiming copy ("Dispatch", HOA registries, universal 311, "AI Grounding Active"), missing emergency notice, Leaflet in the first-load bundle, missing share previews.

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

---

## Definition of Done (demo)

- [x] A user can photograph an issue, set the location (photo GPS, device, search, or pin), add a note, and get the responsible office plus an editable email with the photo attached.
- [x] The app never makes up an office name; an unidentified office shows only map facts.
- [x] Flow is usable keyboard-only.
- [ ] Live at https://fixplease.work over HTTPS (with `www` and `http://` redirecting).
- [ ] Verified on iOS Safari and Android Chrome.
- [ ] No console errors in the demo flow on the live site.

# gullhacks26-Infra (Fix Please) — TODO

Phone-first web app: snap a photo of broken infrastructure, pin the spot, and get who is responsible plus a ready-to-send email with the photo attached. No accounts, no database; the user sends the email themselves.

The original plan (a public report database with tracking codes, a browse map, and statuses) was replaced by the current no-database design. Items from that plan that conflict with it are listed under [Dropped](#dropped-from-the-original-plan).

**Rebuild (2026-11-07).** GullHacks rules forbid code written before the event, and the first version of the app was a pre-event prototype. Starting after hacking opened (Saturday, Nov 7, 12:00), the whole app was rewritten from scratch on branch `feat/rebuild`: new server, new client, new visual identity, same product and API. The prototype's code was deleted, not reused.

**Result.** Fix Please won two prizes at GullHacks 2026 (Nov 7–8): **Winner, Public Systems & Infrastructure** and **Winner, [MLH] Build Your Hackathon A-Team with SpaceXSI**. Devpost: https://devpost.com/software/fixplease. Demo video: https://www.youtube.com/watch?v=sM84YLBRj4I.

**Status (as of 2026-11-09, `main`)**
- Live at https://fixplease.work on Render, behind Cloudflare. DNS stays at Porkbun (the apex A record points at Render). `/api/health` shows `researchConfigured: true`, and `http://` and `www` redirect (301) to `https://fixplease.work/`. Checked on Nov 9 with `curl`; no full report was run on the live site.
- Domain: `fixplease.work`, registered at Porkbun on 2026-11-07 (renews 2027-11-07).
- Only `main` is left. The merged feature branches were deleted locally and on GitHub on Nov 9.
- No CI (no `.github/`).

Last measured on Nov 7, on the rebuild after the no-photo and HEIC merges:
- 176/176 tests pass (`npm test`); `tsc --noEmit` and `vite build` are clean.
- First-load JS is 96.5 kB gzip (82 kB with Brotli, which the server sends). Leaflet (45 kB), exifr, DOMPurify, and the HEIC decoder (heic-to, 809 kB) load only when needed. 2 font files on first load.
- Lighthouse mobile on the production build (merged `main`, 6ce3a95): Performance 98, Accessibility 100, Best Practices 100 on `/`, `/tech`, `/privacy`; LCP 2.1–2.2 s, CLS ≤ 0.037.
- axe: no violations on every page and every flow state (dev scene harness), at 375 and 1440 px.
- Live end-to-end on a local production build, `gemini-3.6-flash` (the default since `7d92769`): photo → search → pin → note → report in 22 s, "Best match" (University of Maryland Facilities Management), report form and phone verified on facilities.umd.edu, no console errors. An earlier run on `gemini-3.5-flash-lite` took 16 s, named Maryland SHA, and downloaded an `.eml` with the photo attached and no EXIF. Same spot, two different offices, both "Best match".

**Priority legend**
- **P1**: should have; fixes honesty or polish gaps a user could notice
- **P2**: stretch

The P0 list (needed for judging and the demo) is finished or no longer needed; see [Done (hackathon)](#done-hackathon).

---

## Open — P1

- [ ] **Smoke test a full report on the live site.** Run one report end to end on https://fixplease.work and check the console for errors. This also proves the proxy keeps the `Host` header: `/api/investigate` rejects any request whose `Origin` host doesn't match `Host` (`isSameOrigin` in `server/app.ts`), so a rewrite would break reports while everything else looks fine.
- [ ] **Spending cap on the live key.** Anyone who loads the public site can spend from the Gemini key, within the rate limits. Confirm the billed project has a budget alert or spending cap.
- [ ] **Deploy notes.** Add the Render setup (build and start commands, environment variables, custom domain) to the README's Deploy section.
- [ ] **Real-device pass on iPhone Safari and Android Chrome**, on https://fixplease.work:
  - Take a photo (rear camera) and From your library, and the "Report without a photo" path (text-only Share)
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
  - No console errors through the report flow
- [ ] **Find spots that reach "Confirmed on an official site".** Test runs so far ended at "Best match". Try a few spots on numbered state routes, where the state road agency publishes which roads it maintains.
- [ ] **README:** add screenshots or a GIF.
- [ ] **Overpass is unreliable.** The public `overpass-api.de` returned 502s and timeouts all afternoon on Nov 7, and two mirrors timed out too, so road, route-number, campus, and streetlight facts were missing (context marked partial; Census and Nominatim still answered). Point `OVERPASS_URL` at an instance that answers, or self-host.
- [ ] **Domain email.** Set up Porkbun email forwarding for something like `hello@fixplease.work`. Use it in `GEOCODER_USER_AGENT` and as the contact on the site.
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

## Done (hackathon)

- [x] Merged `feat/rebuild` (PR #1), `feat/heic-photos` (PR #3), and `feat/report-without-photo` into `main`.
- [x] Deployed on Render with a Gemini key set; Porkbun DNS points `fixplease.work` at it, with HTTPS, and `http://` and `www` redirect to `https://fixplease.work`.
- [x] README points at the live site; the tunnel is now only for testing local changes on a phone.
- [x] Recorded the demo video: https://www.youtube.com/watch?v=sM84YLBRj4I
- [x] Submitted to Devpost: https://devpost.com/software/fixplease
- [x] Team members in the README.
- [x] Won Public Systems & Infrastructure and [MLH] Build Your Hackathon A-Team with SpaceXSI.

No longer needed after the event: a backup recording for the stage, and raising `RESEARCH_RATE_LIMIT` for venue Wi-Fi.

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
- [x] Report without a photo: a "Report without a photo" choice in step 1 (with a "saw it while driving? report it once you've parked" line), so nobody has to take a photo from behind the wheel. The note is then required (at least 5 characters, enforced in the app and by the server's `DETAILS_REQUIRED`); the research, result, and email never mention a photo, and the email is text-only.
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
- [x] Live at https://fixplease.work over HTTPS (with `www` and `http://` redirecting).
- [ ] Verified on iOS Safari and Android Chrome.
- [ ] No console errors in the demo flow on the live site.

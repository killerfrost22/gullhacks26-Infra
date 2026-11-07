# gullhacks26-Infra — Frontend TODO

Web app where residents report broken public infrastructure (potholes, broken streetlights, damaged sidewalks, etc.) by uploading a photo, pinning the location, and describing the problem.

**Priority legend**
- **P0** — required for the hackathon demo (MVP)
- **P1** — should have; makes the demo look polished
- **P2** — stretch goal, only if time allows

---

## 0. Decisions & Team Setup

- [ ] **P0** Confirm the stack. Proposed (boring, fast to build, no paid API keys):
  - React 18 + Vite + TypeScript
  - Tailwind CSS for styling
  - React Router for pages
  - React Hook Form + Zod for form state and validation
  - TanStack Query for API calls/caching
  - Leaflet + react-leaflet with OpenStreetMap tiles for maps
  - MSW (Mock Service Worker) to mock the backend until it is live
  - Vitest + Testing Library (unit/component), Playwright (end-to-end)
- [ ] **P0** Agree on the API contract with the backend team (see §13) **before** building submission; frontend uses MSW mocks until the real API is up.
- [ ] **P0** Assign an owner to each section below and put their name next to the heading.
- [ ] **P0** Git workflow: feature branches `feat/<area>` (e.g. `feat/photo-upload`), small PRs, one teammate reviews before merging to `main`.
- [ ] **P0** Pick a deploy target (Vercel / Netlify / GitHub Pages). Must be **HTTPS** — camera capture and geolocation do not work over plain HTTP (except `localhost`).

---

## 1. Project Scaffolding

- [ ] **P0** Create the app: `npm create vite@latest frontend -- --template react-ts`
- [ ] **P0** Folder structure:
  ```
  frontend/src/
    app/            # router, providers (QueryClient, Toast)
    pages/          # Home, Report, ReportSuccess, MapPage, ReportDetail, Track, NotFound
    components/     # shared UI primitives (Button, Input, Card, ...)
    features/
      report/       # wizard steps, Zod schema, hooks
      map/          # map components, markers, filters
    lib/            # api client, image utils, geo utils
    types/          # shared TS types (Report, Category, ...)
    mocks/          # MSW handlers + seed data
  ```
- [ ] **P0** Install and configure Tailwind, ESLint, Prettier, and the `@/` path alias (in both `vite.config.ts` and `tsconfig.json`).
- [ ] **P0** `.env.example` with `VITE_API_BASE_URL`, `VITE_MAP_TILE_URL`, `VITE_USE_MOCKS`; real `.env` stays out of git.
- [ ] **P0** `.gitignore`: `node_modules/`, `dist/`, `.env`, `.env.local`, `playwright-report/`, `test-results/`.
- [ ] **P0** npm scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:e2e`.
- [ ] **P0** Wire up MSW so `VITE_USE_MOCKS=true` serves fake API responses in dev.

---

## 2. Design System & Layout

- [ ] **P0** Pick a color palette + font; verify text/background contrast meets WCAG AA (4.5:1 body text).
- [ ] **P0** Define status colors **and** icons (never color alone): Submitted, Acknowledged, In progress, Resolved, Rejected.
- [ ] **P0** Define severity colors + icons: Low, Medium, High, Hazard.
- [ ] **P0** Build UI primitives: `Button`, `Input`, `Textarea`, `Select`, `RadioCard` (for categories), `Checkbox`, `Badge`, `Card`, `Modal`, `Toast`, `Spinner`, `Stepper`, `EmptyState`, `ErrorBanner`.
- [ ] **P0** App shell: header (logo, nav: *Report an Issue*, *View Map*, *Track a Report*), footer (About, Privacy), mobile hamburger menu.
- [ ] **P0** Mobile-first layout; check at 360px, 768px, and 1280px widths.
- [ ] **P1** Category icon set (one icon per category in §4.2) — use an icon library like Lucide for consistency.

---

## 3. Landing Page (`/`)

- [ ] **P0** Hero section: one-line value prop ("See something broken? Report it in 30 seconds.") + primary CTA button **Report an issue**.
- [ ] **P0** "How it works" — 3 steps: Snap a photo → Pin the location → Submit & track.
- [ ] **P1** Live stats: total reports, resolved count, top categories (from `GET /api/reports/stats` or computed client-side).
- [ ] **P1** "Recent reports" strip (latest 6 cards with thumbnail, category, status) linking to detail pages.
- [ ] **P0** Secondary CTA **View map of reports**.

---

## 4. Report Submission Flow (`/report`) — CORE FEATURE

Multi-step wizard (better on phones than one long form):
**1. Photo → 2. Category & details → 3. Location → 4. Contact & review → Submit**

### 4.1 Photo step

- [ ] **P0** Two buttons on mobile:
  - **Take photo** → `<input type="file" accept="image/*" capture="environment">` (opens rear camera directly)
  - **Choose from library** → same input **without** `capture` (on iOS, `capture` hides the photo library, so both buttons are needed)
- [ ] **P0** Drag-and-drop zone + click-to-browse on desktop.
- [ ] **P0** Allow 1–5 photos; at least 1 required to continue.
- [ ] **P0** Thumbnail previews using `URL.createObjectURL`; call `URL.revokeObjectURL` on remove/unmount to avoid memory leaks.
- [ ] **P0** Remove button on each thumbnail (keyboard accessible, `aria-label="Remove photo 2"`).
- [ ] **P0** Validate type (`image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`) and size (≤ 10 MB before compression); show inline error per rejected file.
- [ ] **P1** Client-side resize/compress before upload (max 1920px long edge, quality ~0.8) using `browser-image-compression` or canvas; this makes uploads fast on mobile data.
- [ ] **P1** HEIC handling: test what iPhone Safari actually sends; if HEIC arrives, convert to JPEG with `heic2any` so previews and the backend work.
- [ ] **P1** Read EXIF GPS with `exifr`; if present, prefill the location step and ask "Use the location from this photo?".
- [ ] **P1** Strip EXIF metadata (device model, timestamps, GPS) before upload for privacy — canvas re-encoding does this; GPS is sent only as the explicit location field.
- [ ] **P1** Verify photos are not rotated sideways after re-encoding (EXIF orientation).
- [ ] **P2** Reorder photos / choose the primary (cover) photo.
- [ ] **P2** Optional per-photo caption, used as image alt text.

### 4.2 Category & details step

- [ ] **P0** Category picker as large icon cards (radio-group semantics):
  - Pothole
  - Streetlight out / damaged
  - Damaged sidewalk / curb
  - Traffic signal problem
  - Damaged or missing sign
  - Water leak / broken hydrant
  - Blocked storm drain / flooding
  - Fallen tree / debris on road
  - Graffiti / vandalism
  - Other (requires a short description of what it is)
- [ ] **P1** Category-specific subcategories, e.g.
  - Streetlight: Out / Flickering / On during the day / Pole damaged
  - Pothole: In traffic lane / Bike lane / Shoulder / Parking area
  - Sidewalk: Cracked / Uplifted (trip hazard) / Missing section / Blocked
- [ ] **P1** Category-specific extra fields, e.g. pothole approximate size (Small < 30 cm, Medium 30–60 cm, Large > 60 cm); streetlight pole number if visible.
- [ ] **P0** Severity selector: Low / Medium / High / Hazard, each with helper text. Selecting **Hazard** shows a banner: "If there is immediate danger to life or property, call 911."
- [ ] **P0** Description textarea: 10–1000 characters, live character counter, placeholder with an example.
- [ ] **P1** Optional title; if blank, auto-generate from category + street (e.g. "Pothole on Main St").
- [ ] **P1** "When did you notice it?" date input — defaults to today, cannot be in the future.

### 4.3 Location step

- [ ] **P0** **Use my current location** button → `navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })`.
  - Handle each error with a clear message: permission denied ("Enable location in browser settings or pick on the map"), position unavailable, timeout.
  - Show accuracy radius circle on the map.
- [ ] **P0** Interactive Leaflet map with a **draggable pin**; clicking the map moves the pin.
- [ ] **P0** Show the selected coordinates and the reverse-geocoded street address (Nominatim `reverse`).
  - Nominatim usage policy: max 1 request/second, identify the app, **no client-side autocomplete**. Debounce pin drags; consider proxying through the backend.
- [ ] **P0** Show OSM attribution on every map ("© OpenStreetMap contributors") — required by the tile license.
- [ ] **P1** Address search box: search on Enter/button press with Nominatim (not type-ahead), or use Photon if type-ahead is wanted.
- [ ] **P1** "Location notes" field (e.g. "northbound lane in front of 123 Main St", "pole #4471").
- [ ] **P1** Service-area check: warn if the pin is outside the supported city/campus boundary (GeoJSON polygon).
- [ ] **P2** Duplicate detection: show existing open reports within ~50 m of the pin — "Is it one of these?" → user can upvote instead of filing a duplicate.

### 4.4 Contact & review step

- [ ] **P0** Optional name, email, phone. **Report anonymously** toggle hides/clears these fields.
- [ ] **P1** Opt-in "Email me when the status changes" (requires a valid email).
- [ ] **P0** Review summary card showing every entered value + photo thumbnails, with **Edit** links that jump back to the right step.
- [ ] **P0** Consent checkbox: "Photos and description will be public. Avoid capturing faces and license plates where possible." Contact info is never public.
- [ ] **P1** Bot protection (Cloudflare Turnstile or hCaptcha) — token sent with submission; coordinate with backend.

### 4.5 Form state & validation

- [ ] **P0** One Zod schema for the whole report; each step validates only its own fields before **Next** is enabled.
- [ ] **P0** React Hook Form; inline error messages under each field; on failed submit, focus the first invalid field.
- [ ] **P0** Stepper at the top shows current step and completed steps; **Back** never loses entered data.
- [ ] **P1** Sync the current step to the URL (`/report?step=3`) so the browser back button moves between steps.
- [ ] **P1** Save draft to `localStorage` (text fields) and IndexedDB (photos) so a page refresh doesn't lose progress; show "Resume your draft?" + **Discard draft**.
- [ ] **P1** Warn before leaving the page with unsaved changes (`beforeunload`).

### 4.6 Submission

- [ ] **P0** Build `multipart/form-data`: a `data` JSON part + `photos[]` file parts, POST to `/api/reports` (see §13).
- [ ] **P0** Disable the submit button and show a spinner while in flight; prevent double submission.
- [ ] **P1** Upload progress bar — use XHR/axios `onUploadProgress` (`fetch` does not expose upload progress).
- [ ] **P0** Error handling (never lose the user's data):
  - Network error / offline → "Couldn't reach the server" + **Retry**
  - `400` → map server field errors back onto form fields
  - `413` → "Photos too large" (re-compress or remove one)
  - `429` → "Too many reports, try again in a minute"
  - `5xx` → generic error + **Retry**
- [ ] **P2** Offline queue: if offline, store the report in IndexedDB and auto-submit on the `online` event; show "Will send when you're back online".

### 4.7 Confirmation page (`/report/success/:id`)

- [ ] **P0** Show tracking code (e.g. `INF-7K3Q`), summary, and primary photo.
- [ ] **P0** Buttons: **View on map**, **Report another issue**, **Copy tracking link**.
- [ ] **P1** Save the report ID to `localStorage` under "My reports" (see §7).
- [ ] **P1** Share via the Web Share API (`navigator.share`) with clipboard fallback.

---

## 5. Map / Browse Reports (`/map`)

- [ ] **P0** Full-screen Leaflet map with a marker per report; marker icon/color by category, style by status (e.g. resolved = faded/check).
- [ ] **P0** Click marker → popup with thumbnail, category, severity, status, date, **View details** link.
- [ ] **P0** Legend explaining marker icons and colors.
- [ ] **P1** Marker clustering (`leaflet.markercluster`) so dense areas stay readable.
- [ ] **P1** Filters: category (multi-select), status, severity, date range. Persist filters in URL query params so links are shareable.
- [ ] **P1** Fetch only reports in view: `GET /api/reports?bbox=...` on `moveend`, debounced ~300 ms.
- [ ] **P1** List view toggle: cards sorted by Newest / Severity / Most upvoted, with pagination or infinite scroll.
- [ ] **P1** "Locate me" button to center the map on the user.
- [ ] **P2** Heatmap layer toggle.
- [ ] **P2** Near-real-time updates (poll every 10–15 s, or websocket if backend supports it) — great for the live demo.

---

## 6. Report Detail Page (`/reports/:id`)

- [ ] **P0** Photo gallery with a lightbox (tap to enlarge, swipe between photos).
- [ ] **P0** Category, subcategory, severity badge, status badge, description, address + location notes, reported date.
- [ ] **P0** Mini map showing the pin.
- [ ] **P0** Loading skeleton and a proper "Report not found" state for unknown IDs.
- [ ] **P1** Status timeline: Submitted → Acknowledged → In progress → Resolved, with timestamps and staff notes.
- [ ] **P1** **I see this too** upvote button (one per device via `localStorage`; backend also dedupes).
- [ ] **P1** Share / copy link button.
- [ ] **P2** Public comments.

---

## 7. Track My Report (`/track`)

- [ ] **P1** Input for a tracking code → look up via `GET /api/reports/track/:code` → redirect to the detail page; friendly error if not found.
- [ ] **P1** "My reports" list from `localStorage` with current status of each (fetched fresh).

---

## 8. Admin / City Staff Dashboard (P2 — only if time allows)

- [ ] **P2** Staff login (coordinate auth with backend).
- [ ] **P2** Sortable/filterable table of all reports.
- [ ] **P2** Change status, add a resolution note, upload an "after" photo.
- [ ] **P2** Bulk actions (mark duplicates, merge reports).

---

## 9. Accessibility (P0 throughout — check every PR)

- [ ] Semantic HTML (`<main>`, `<nav>`, `<form>`, `<fieldset>`/`<legend>` for the category and severity groups).
- [ ] Every input has a `<label>`; errors and helper text linked with `aria-describedby`; errors announced (`aria-live="polite"`).
- [ ] Full keyboard support: category cards (arrow keys within radio group), photo remove buttons, stepper, map popups, modal focus trap + `Esc` to close.
- [ ] The map is **not** the only way to set a location — address search + "use my location" work without a mouse or screen.
- [ ] Image alt text: photo caption if provided, else "Photo of reported {category}".
- [ ] Status/severity shown with icon + text, not color alone.
- [ ] Visible focus rings; respect `prefers-reduced-motion`.
- [ ] Run axe DevTools and Lighthouse; target accessibility score ≥ 95.

---

## 10. Mobile & PWA

- [ ] **P0** Test on a real iPhone (Safari) and a real Android phone (Chrome): camera capture, photo library, geolocation permission prompts all behave differently.
- [ ] **P0** Tap targets ≥ 44×44 px; sticky bottom **Next / Submit** bar on mobile.
- [ ] **P0** Correct mobile keyboards: `type="email"`, `type="tel"`, `inputmode` where relevant.
- [ ] **P1** Web app manifest + icons so it can be added to the home screen.
- [ ] **P1** `vite-plugin-pwa` service worker caching the app shell (fast reloads, works on flaky campus Wi-Fi).

---

## 11. Performance

- [ ] **P1** Lazy-load map pages with `React.lazy` + `Suspense` (Leaflet is heavy; landing page shouldn't pay for it).
- [ ] **P1** Use backend-provided `thumbnailUrl` in lists/popups; full-size images only in the lightbox.
- [ ] **P1** `loading="lazy"` on images below the fold.
- [ ] **P1** Lighthouse mobile performance ≥ 85; check bundle size with `rollup-plugin-visualizer`.

---

## 12. Security & Privacy

- [ ] **P0** Never render user text as HTML (no `dangerouslySetInnerHTML`); React escapes by default.
- [ ] **P0** Reporter contact info is never displayed publicly or included in public API responses.
- [ ] **P0** No secrets in the frontend — every `VITE_*` variable ships to the browser.
- [ ] **P1** Strip photo EXIF before upload (see §4.1).
- [ ] **P1** Client-side file type/size checks (backend must still validate for real).
- [ ] **P1** Privacy page (`/privacy`): what is collected, what is public, how long it's kept.

---

## 13. API Contract (draft — finalize with backend)

### Report model

| Field          | Type                                                                 | Notes                                       |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| `id`           | string (UUID)                                                        |                                             |
| `trackingCode` | string                                                               | short, human-friendly, e.g. `INF-7K3Q`      |
| `category`     | enum                                                                 | `pothole`, `streetlight`, `sidewalk`, `traffic_signal`, `sign`, `water`, `drainage`, `debris`, `graffiti`, `other` |
| `subcategory`  | string \| null                                                       |                                             |
| `severity`     | enum                                                                 | `low`, `medium`, `high`, `hazard`           |
| `title`        | string                                                               |                                             |
| `description`  | string                                                               | 10–1000 chars                               |
| `location`     | `{ lat: number, lng: number, address?: string, notes?: string }`     |                                             |
| `photos`       | `{ id, url, thumbnailUrl, width, height }[]`                         | 1–5                                         |
| `status`       | enum                                                                 | `submitted`, `acknowledged`, `in_progress`, `resolved`, `rejected` |
| `statusHistory`| `{ status, at, note? }[]`                                            | for the timeline                            |
| `upvotes`      | number                                                               |                                             |
| `reporter`     | `{ name?, email?, phone?, anonymous: boolean }`                      | **write-only**, never returned publicly     |
| `notedAt`      | ISO 8601 date                                                        | when the user noticed it                    |
| `createdAt`    | ISO 8601 datetime                                                    |                                             |
| `updatedAt`    | ISO 8601 datetime                                                    |                                             |

### Endpoints

| Method | Path                               | Request                                              | Response                              |
| ------ | ---------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| POST   | `/api/reports`                     | multipart: `data` (JSON) + `photos[]`                | `201 { id, trackingCode }`            |
| GET    | `/api/reports`                     | `?bbox=minLng,minLat,maxLng,maxLat&category=&status=&severity=&from=&to=&page=&pageSize=` | `{ items: Report[], total }` |
| GET    | `/api/reports/:id`                 |                                                      | `Report` (public fields)              |
| GET    | `/api/reports/track/:trackingCode` |                                                      | `Report` (public fields)              |
| POST   | `/api/reports/:id/upvote`          |                                                      | `{ upvotes }`                         |
| GET    | `/api/categories`                  |                                                      | categories + subcategories + extra fields (lets us change categories without redeploying) |
| GET    | `/api/reports/stats`               |                                                      | `{ total, resolved, byCategory }`     |

Error shape for all endpoints:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "fields": { "description": "Too short" } } }
```

### Frontend tasks for the contract

- [ ] **P0** TypeScript types in `src/types/report.ts` mirroring the model above.
- [ ] **P0** Typed API client `src/lib/api.ts` (base URL from `VITE_API_BASE_URL`, parses the error shape).
- [ ] **P0** TanStack Query hooks: `useReports(filters)`, `useReport(id)`, `useCreateReport()`, `useUpvote(id)`, `useCategories()`.
- [ ] **P0** MSW handlers implementing every endpoint + ~30 realistic seed reports around the demo area, spread across categories/statuses.
- [ ] **P1** Confirm CORS + max upload size with backend.

---

## 14. Testing

- [ ] **P1** Unit (Vitest): Zod schema rules, image utils (type/size checks, compression output size), geo utils (distance, bbox, inside-boundary).
- [ ] **P1** Component (Testing Library):
  - Photo uploader: add, remove, reject wrong type / oversize file
  - Category picker: keyboard selection, "Other" requires text
  - Wizard: can't advance with invalid step; Back keeps data
  - Submit: shows field errors from a `400`, retry on network error
- [ ] **P1** End-to-end (Playwright, against MSW mocks):
  - Happy path: upload fixture image → pick category → mocked geolocation (`context.setGeolocation`) → submit → success page shows tracking code
  - New report appears on `/map`
  - Run in a mobile viewport project (iPhone + Pixel profiles)
- [ ] **P0** Manual QA checklist before demo: iOS camera, Android camera, location denied, slow 3G throttling, offline, screen reader pass on the report form.

---

## 15. CI/CD & Deployment

- [ ] **P1** GitHub Actions on every PR: `npm ci` → `lint` → `typecheck` → `test` → `build`.
- [ ] **P1** Preview deploy per PR (Vercel/Netlify); production deploy from `main`.
- [ ] **P0** SPA fallback so deep links like `/reports/123` don't 404 (`_redirects` on Netlify / `rewrites` in `vercel.json` / `404.html` trick on GitHub Pages).
- [ ] **P0** Set `VITE_API_BASE_URL` per environment.

---

## 16. Demo Prep

- [ ] **P0** Seed realistic demo data (real-looking photos, believable descriptions, mix of statuses).
- [ ] **P0** Scripted demo: judge watches on projector → teammate on phone snaps a "pothole" → location auto-fills → submit → marker appears on the projected map.
- [ ] **P0** Backup screen recording of the full flow in case Wi-Fi or geolocation fails on stage.
- [ ] **P0** README: what it does, screenshots/GIF, tech stack, setup (`npm install`, `npm run dev`), team members.
- [ ] **P0** Devpost write-up: problem, solution, how it works, challenges, what's next.

---

## Definition of Done (MVP)

- [ ] A user on a phone can take or upload a photo, pick a category and severity, set the location (GPS or map pin), write a description, submit, and receive a tracking code.
- [ ] The submitted report appears on the map and has its own detail page.
- [ ] Works on iOS Safari and Android Chrome over HTTPS.
- [ ] Report form is fully usable with keyboard only.
- [ ] No console errors in the demo flow.

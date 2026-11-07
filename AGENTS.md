# AGENTS.md

Every agent working on this repository MUST follow these rules for all website work in `gullhacks26-Infra`.

## Quality benchmark

- The benchmark is award-winning websites from **Awwwards**, **The Webby Awards**, and **FWA**. Measure every page, component, and interaction against that standard, not against "good enough", generic templates, or default component-library styling.
- Before designing a page or major component, study current winners relevant to it (awwwards.com, webbyawards.com, thefwa.com). Note what makes them work: type, layout, motion, interaction. Take principles from them. NEVER copy their layouts, assets, or code.

## Definition of done

A task is done when the self-review loop below finds nothing left to meaningfully improve, or its pass cap is reached, and every product rule and speed and accessibility limit below still holds. A page that works but has not been through the loop is not done.

## Self-review loop (mandatory)

Once the build works, run it in a real browser and repeat:

1. **Render**: look at the actual rendered output at 375px, 768px, 1440px, and 1920px widths, including every interaction and animation. Reading the code does not count as reviewing.
2. **Critique**: judge the result against the benchmark on every dimension below. Write down concrete issues, e.g. "hero headline and nav compete for attention at 1440px", not "could be better".
3. **Refine**: fix the issues, highest impact first.
4. **Repeat**: render again and critique again.

Stop when a full pass across all dimensions turns up no meaningful improvement, meaning further changes would be churn or personal taste rather than real gains. **Cap: at most 3 passes per page or major component.** Issues still open after pass 3 go into the final report and `TODO.md` instead of a fourth pass. In the final report, summarize what each pass changed.

## Review dimensions

| Dimension | What to check |
| --- | --- |
| **Typography** | Intentional typeface choice and pairing; a clear modular type scale; body line length of 45–75 characters; comfortable line-height; tightened tracking on display sizes; no widows or orphans in headlines; fonts load without layout shift. |
| **Whitespace** | One consistent spacing scale; generous room to breathe; elements aligned to a grid; density chosen on purpose, not left over. |
| **Visual hierarchy** | One clear focal point per view; the primary action is obvious at a glance; content scans in the intended order. |
| **Color** | A restrained palette defined as tokens; accent color used sparingly and on purpose; WCAG AA contrast (4.5:1 for body text, 3:1 for large text and UI); interactive states clearly distinct. |
| **Motion** | Every animation has a purpose (guiding attention, showing cause and effect, setting pace); custom easing, never linear defaults; durations that feel quick and confident; animate `transform` and `opacity` only to hold 60fps; respects `prefers-reduced-motion`. |
| **Micro-interactions** | Every interactive element has hover, `:focus-visible`, active, disabled, and loading states where they apply; feedback is immediate; affordances read clearly on both pointer and touch. |
| **Responsiveness** | Fluid from 320px to 2560px; no horizontal scroll; touch targets of at least 44×44px; layouts recomposed for each viewport rather than just shrunk. |
| **Originality** | A distinct visual identity rooted in Fix Please's own concept and content (civic repair: something broken in the street, the exact spot, who fixes it, the email you send); it must not look like a stock template or a generic hero-plus-three-cards layout. Give it at least one memorable signature moment. |

## Product rules (never break these)

Design and copy changes MUST NOT weaken these. If a design idea needs one of them bent, drop the idea.

- **No invented facts.** Never invent an organization, department, email, phone number, or URL, in the server or as a UI fallback. If the office can't be identified, say so plainly and show only the map facts we have (municipality, county, road).
- **Sources must load.** A source counts only if the server opened it during this report. A page the model names without search returning it counts only if it is on a government or university domain, on a site search already returned, or on the campus's own website.
- **"Confirmed on an official site"** requires the coverage quote, word for word, on that loaded page. Anything less is "Best match". A result produced by the recitation retry is at most "Best match".
- **Real contacts only.** An email or phone number shows only if it is published on an official page the server read. A fallback inbox must be a repair or service address on the office's own domain. Never personal, press, HR, or webmaster addresses.
- **No accounts, no database, no analytics.** Reports live only in the page and are gone when it closes.
- **The user sends the email.** The app never sends anything for them.
- **Photos stay private.** Photos are resized and stripped of metadata on the device before upload. Photo GPS only suggests a pin; the user confirms it.
- **Copy matches the code.** UI text never claims sources the server doesn't query, actions it doesn't take, or certainty it doesn't have. A "not for emergencies" notice is visible in the UI.
- **Keys stay on the server.** The Gemini key never reaches the browser. Never prefix a key with `VITE_`.

## Speed and accessibility limits

Measure these on the production build (`npm run build`, then `npm start`), not the dev server.

- **The report flow comes first.** Photo → pin → note → result never waits on a decorative effect. The signature moment must not delay the first interaction or the report.
- **JavaScript budget:** at most 160 kB gzip of JS on first load. Leaflet, the map, and photo-metadata parsing load only when the flow needs them. `vite build` prints the sizes; report them.
- **No heavy effects stack:** no WebGL, 3D, or animation libraries. Motion uses CSS and the Web Animations API.
- **Fonts:** self-hosted (`@fontsource`), at most 2 families and 4 font files on first load, with `font-display: swap` and fallbacks sized to avoid layout shift.
- **Lighthouse, mobile preset:** Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, CLS < 0.1, LCP < 2.5 s.
- **Keyboard and screen reader:** the whole flow works keyboard-only with visible focus; status changes are announced; axe reports no serious or critical issues.

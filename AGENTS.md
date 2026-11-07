# AGENTS.md

Every agent working on this repository MUST follow these rules for all website work in `gullhacks26-Infra`.

## Quality benchmark

- The benchmark is award-winning websites from **Awwwards**, **The Webby Awards**, and **FWA**. Measure every page, component, and interaction against that standard, not against "good enough", generic templates, or default component-library styling.
- Before designing a page or major component, study current winners relevant to it (awwwards.com, webbyawards.com, thefwa.com). Note what makes them work: type, layout, motion, interaction. Take principles from them. NEVER copy their layouts, assets, or code.

## Definition of done

A task is done when the self-review loop below finds nothing left to meaningfully improve. A page that works but has not been through the loop is not done.

## Self-review loop (mandatory)

Once the build works, run it in a real browser and repeat:

1. **Render**: look at the actual rendered output at 375px, 768px, 1440px, and 1920px widths, including every interaction and animation. Reading the code does not count as reviewing.
2. **Critique**: judge the result against the benchmark on every dimension below. Write down concrete issues, e.g. "hero headline and nav compete for attention at 1440px", not "could be better".
3. **Refine**: fix the issues, highest impact first.
4. **Repeat**: render again and critique again.

Stop only when a full pass across all dimensions turns up no meaningful improvement, meaning further changes would be churn or personal taste rather than real gains. In the final report, summarize what each pass changed.

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
| **Originality** | A distinct visual identity rooted in the Crucible concept and its content; it must not look like a stock template or a generic hero-plus-three-cards layout. Give it at least one memorable signature moment. |

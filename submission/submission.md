# Fix Please

**See something broken? Snap it. We'll find who fixes it.**

Fix Please ([fixplease.work](https://fixplease.work)) is a phone-first web app for reporting broken public infrastructure. Take a photo of a pothole, a dead streetlight, or a cracked sidewalk (or just describe it), pin the exact spot, and Fix Please works out which office maintains it, shows you the evidence, and drafts the email. You send it yourself.

- **Awards (GullHacks 2026):** Winner, Public Systems & Infrastructure. Winner, [MLH] Build Your Hackathon A-Team with SpaceXSI.
- **Site:** https://fixplease.work
- **Devpost:** https://devpost.com/software/fixplease
- **Demo video:** https://www.youtube.com/watch?v=sM84YLBRj4I
- **Code:** https://github.com/killerfrost22/gullhacks26-Infra
- **Categories:** Public Systems & Infrastructure; AI & Autonomous Systems

This is our long-form write-up. The shorter text the judges read is on the Devpost page.

## Team

| Name | Role |
|---|---|
| Nyles Burton | Documentation |
| Gabby Ao | Business Analyst |
| Yizhan Ao | Programmer |
| Padma Waiba | Testing |

## Inspiration

Noticing a pothole is easy. Knowing who to tell is not. A road inside a city can belong to the state. A streetlight can belong to the power company. A path near campus can belong to the university, the town, or a property manager. Most people give up before they find the right office, so the problem stays where it is, and people come away feeling that nobody is listening.

We wanted to cut the distance between "someone should fix this" and a report that reaches someone who can. Everyone already carries the two best pieces of evidence: a photo and a location. Fix Please starts there.

## What it does

1. **Snap, or skip it.** Take a photo or pick one from your library. The phone shrinks it and re-encodes it before upload, which strips the hidden metadata (camera, time, GPS). If the original had GPS, that only suggests where the pin should go. Saw it while driving? Choose "Report without a photo" once you've parked, so nobody has to take a photo from behind the wheel.
2. **Pin the exact spot.** Use the photo's location, "I'm standing here", an address search, a tap or drag on the map, or typed coordinates. Search results are numbered on the map, so when several share a name you can pick by place. You confirm the pin before anything else happens.
3. **Add a clue.** One box: which lane, a landmark, a pole number, an HOA. A clue like that is often what decides between the city, the state, and a utility. It's optional with a photo; without one, it's required, because it's the only description of the problem.
4. **Find who fixes it.** The server gathers map facts for the pin: the nearest road and its route number, whether you're inside a city, town, or township and which county, the campus you're on, and mapped streetlights with their operator and pole number. Gemini then reads the photo (if there is one), your note, and those facts, and searches official city, county, state, campus, and utility sites.
5. **See the evidence.** The answer comes with one of three labels:
   - **"Confirmed on an official site"**: the sentence proving who covers this spot appears word for word on an official page we loaded during your report.
   - **"Best match. Worth a quick check."**: an office is named and at least one official page loaded during the research, but none of them proves this exact spot.
   - **"We couldn't identify the office"**: we show the map facts instead of a name. We never make up an office.

   The pages behind the answer (up to eight) are listed under "How we know", and every phone number or email links to the page it was published on.
6. **Send it yourself.** Fix Please drafts an editable email (To, Subject, Message). Where the browser can share files (most phones), "Send with photo" opens the share sheet with the photo attached; without a photo, "Share" sends the text. Anywhere, "Download email" saves a ready-to-send `.eml` file, with the photo attached if you added one. You can also open your mail app or copy the text. Nothing is ever sent for you.

There are no accounts, no database, and no analytics. Close the tab and Fix Please keeps nothing (Google may keep the Gemini request for up to 30 days, as our privacy page explains). Fix Please is for routine repairs; the app tells you to call your local emergency number if someone is hurt or wires are down.

## How we built it

**Front end.** React 19 and TypeScript, built with Vite 8, written phone-first. Leaflet and OpenStreetMap draw the map. exifr reads the photo's GPS on the device, and the Canvas API resizes and re-encodes the photo. The map, photo tools, and HTML sanitizer load only when the flow needs them, so the first page load is 93.8 kB of gzipped JavaScript as our server sends it (81 kB with Brotli).

**Server.** One Node.js 24 and Express 5 server, in TypeScript. It keeps the Gemini key off the device, serves the app, and runs three jobs:

- **Map facts.** The Overpass API (OpenStreetMap) gives the nearest road, route number, campus, and streetlights. The U.S. Census geocoder tells an incorporated city, town, or township apart from unincorporated county land. Nominatim handles address search and is the backup for the campus. All three run in parallel under a 9-second cap, and a report waits at most 4 seconds for them (usually they're already cached from your pin). If one fails, the report says some facts are missing instead of failing.
- **Research.** Two Gemini calls through the Interactions API, using plain `fetch`. The first uses Google Search grounding and URL context to find who maintains this asset at this spot. The second has no tools and turns that research into JSON matching a Zod schema. The whole report must finish within 45 seconds.
- **Evidence checks.** The server opens the pages search returned (up to 10) and the pages the model names (up to 6 at a time) that pass the rules below. It accepts only public web addresses, follows at most 5 redirects, and stops at 6 seconds or 2 MB. Links that don't load are dropped. A page the model names without search returning it counts only if it's on a government or university site, a site search already returned, or the campus's own website. A coverage quote must match the page word for word to earn "Confirmed". An email or phone number survives only if it's published on an official page we read. An email must be a shared office inbox, either a repair or service address or a general one like info@, never a personal, press, HR, or webmaster address. If the model names none, we fall back only to a repair or service inbox on the office's own domain. Any contact details or links the model writes into its own explanation are removed unless they're the verified ones.

**Choosing the model.** We benchmarked every Gemini model our key could run the app's research request on (photo plus Google Search), using four test cases with freely licensed photos. Every answer we got back named the right office and issue type; the only miss was one `gemini-4-argon` run that timed out after 180 seconds. We picked `gemini-3.6-flash`: its photo descriptions were clearly more precise than the Flash-Lite models', its slowest research call took 20.8 seconds, well inside our 45-second limit, and its research call averaged under 1¢ in tokens (0.63¢ median). The benchmark script, photos, and every raw API response are in the repo.

**Abuse protection.** A self-hosted ALTCHA proof-of-work check runs in a Web Worker, taking about a quarter of a second on our development computer with no puzzle to solve. Each token works once. Reports are rate-limited per IP address (5 per 15 minutes by default), and the API rejects report requests sent from other websites.

**Design.** We call the look "the street and the paperwork": a dark asphalt column next to a paper form, in survey-paint orange, the color road crews use to mark repairs. A hand-sprayed ring circles "broken" in the headline and "FIX" in the logo, the map pin is the same paint mark, and the verdict lands like a rubber stamp. Type is Big Shoulders and Public Sans, self-hosted.

**Quality checks.** 176 automated tests cover the API, map facts, evidence rules, bot check, and email builder, and all of them run offline. Lighthouse's mobile test on the production build scored Performance 98, Accessibility 100, and Best Practices 100 on all three pages. axe found no accessibility violations on any page or step. The whole flow works with only a keyboard. We reviewed every screen in a real browser at widths from 320 to 2560 pixels.

## Challenges we ran into

- **The nearest office isn't always the owner.** City limits, numbered highways, campus roads, and utility poles overlap. In our own tests, two Gemini models looked at the same pothole on Campus Drive in College Park and named different offices: one said the State Highway Administration, the other University of Maryland Facilities Management. Neither could prove its answer on an official page, so both came back as "Best match". That is exactly why the label exists.
- **A convincing answer is not evidence.** A code review of our own checks found real gaps, and we fixed each one with a test:
  - a staff member's address like `jsmith@town.gov` could have filled the To line;
  - a phone number written into the model's explanation skipped the checks;
  - a town was labelled "City of …", an office that doesn't exist;
  - one slow web page could stall a whole report.
- **Not every town is a city.** In New England, New York, New Jersey, Pennsylvania, Michigan, Minnesota, and Wisconsin, towns and townships are the local government, but Census files them differently from cities. Without handling that, a pin in Greenwich, Connecticut came out as unincorporated county land, which pointed the research at a county government Connecticut doesn't have.
- **Public map services go down.** The main public Overpass server returned errors and timeouts for hours during the hackathon. Reports still work: the server pauses Overpass for a minute after a failure, takes the campus from Nominatim instead, and tells you some facts are missing.
- **Showing Google's suggestions by Google's rules.** Gemini's search grounding requires showing Google's search-suggestion chips exactly as provided. Their markup made the whole page scroll sideways on phones. We contained it from the outside without restyling anything inside.
- **Email attachments differ by device.** A `mailto:` link can't attach a photo. So we generate a real `.eml` file with the attachment, use the phone's share sheet where it can send files, and say plainly when an option won't include the photo.

## Accomplishments that we're proud of

- **Honest uncertainty is part of the interface.** Every answer carries a label you can check, and every source is a page we actually loaded during your report.
- **We check contacts before showing them.** If we can't verify an email address, the To line stays empty and, when we found one, we point you to the office's own report form.
- **Privacy by design.** No accounts, no database, no analytics. The photo's metadata never leaves your phone, and the app spells out exactly what goes to Google Gemini.
- **Fast and accessible.** Lighthouse mobile scores of 98 / 100 / 100, no axe violations, and the whole flow works with only a keyboard.
- **We measured instead of guessing.** The model choice comes from a benchmark of every model that could run our research request, with the data in the repo for anyone to re-check.

## What we learned

- **Finding who's responsible is harder than recognizing the problem.** Spotting a pothole in a photo is the easy part. Finding who maintains that exact stretch of road is the useful part.
- **Grounding and verification are different jobs.** Search gives the model material to reason from. Separate checks on our server decide which claims and contacts you get to see.
- **People hold the deciding clue.** A pole number or an HOA name often settles a question that the photo and the address can't.
- **Search costs more than tokens.** For our model, about 10 Google searches per report cost more than the model's tokens once the free monthly searches run out, so searches per report matter as much as speed.

## What's next for Fix Please

- Test on real iPhones and Android phones.
- Build a larger set of test reports, including hard cases, and find demo spots that reach "Confirmed on an official site".
- Show real progress while a report runs, instead of a timer.
- Run our own map services for public traffic, and cap searches per report to keep costs predictable.
- Work with local governments to embed Fix Please on their own sites, so reports land in the right inbox from the start.

## Built with

typescript · react · vite · node.js · express · google-gemini · google-search-grounding · zod · leaflet · openstreetmap · overpass-api · nominatim · us-census-geocoder · altcha · dompurify · exifr · web-share-api · css

## Files

- Demo video script: [video-script.md](video-script.md)
- Devpost thumbnail: [thumbnail.png](thumbnail.png) (1500×1000 PNG, 3:2, 74 KB)
- Remotion photo video of Maryland campuses and landmarks: [video/](video/) (photo credits in [video/CREDITS.md](video/CREDITS.md))

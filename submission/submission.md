# Fix Please

**See something broken? Snap it. We’ll find who fixes it.**

Fix Please (`fixplease.work`) is a phone-first web app that helps people identify who likely maintains a broken piece of local infrastructure and prepare a report for that organization.

## 1) Inspiration

Noticing a pothole, a broken streetlight, or a damaged walkway is easy. Knowing where to report it is not. A road inside a city might belong to the state. A light might be maintained by a utility. A problem near campus might belong to university facilities, a public agency, or a private property manager.

We wanted to reduce the work between “someone should fix this” and contacting someone who can help. People should not need to understand jurisdiction boundaries or search through several government websites just to report an everyday maintenance issue.

That led to Fix Please: start with the evidence people already have—a photo and a location—then help them find the right destination and put together a useful message.

## 2) What it does

Fix Please guides users through a short reporting flow:

1. **Photograph the problem.** Take or choose a photo. The browser resizes it and removes hidden metadata before upload. GPS from the original image can suggest a location, but the user still confirms the spot.
2. **Confirm the location.** Search for an address, use device location, use the photo’s GPS, or place a pin on the map.
3. **Add useful context.** A short note can identify a lane, landmark, pole number, campus department, HOA, or other ownership clue.
4. **Find who likely fixes it.** The app combines the photo, location, note, and available geographic context with Gemini’s search of official sources. It presents an organization, an explanation, supporting links, and published contact details when available.
5. **Review and send.** The user can edit an email draft, download an email file with the photo attached, or use file sharing on a supported phone. An official reporting page is available when found. The user—not Fix Please—decides what to send and sends it from their own account.

The result distinguishes official-site support from a best match, and says plainly when the office can't be identified, showing only the map facts instead of a guessed name. A plausible answer is not presented as guaranteed ownership, and a missing public email address is not filled with an invented one.

Fix Please has no accounts, report database, or analytics. The prepared photo, confirmed pin, and note are sent to Google Gemini; Google may retain search-grounded requests for up to 30 days under its API terms. OpenStreetMap services also receive map and address requests. The app is for routine maintenance, not emergencies.

## 3) How we built it

We built the interface with **React, TypeScript, and Vite**, using a responsive layout that works on phones and desktop. **Leaflet** displays the map, and **exifr** reads optional GPS from the original photo. The browser then redraws the image to a canvas and exports a resized JPEG without the original metadata.

A **Node.js and Express** backend keeps the Gemini API key off the client and coordinates location lookup, investigation, and verification. Shared TypeScript types connect the frontend and backend; **Zod** defines and validates the structured research output.

For location context, we use **OpenStreetMap’s Overpass API** for nearby roads, route numbers, campuses, and mapped streetlights; **Nominatim** supports address search, reverse geocoding, and fallback context. **U.S. Census Bureau geographic data** helps distinguish incorporated municipalities from surrounding county areas. These are routing clues, not proof of maintenance ownership.

The AI workflow separates research from formatting. First, **Google Gemini**, using Google Search grounding and URL context, examines the photo and researches the likely responsible office. A second model call turns that evidence brief into a structured report without starting another search.

The server then applies evidence checks. It resolves search citation redirects, reads supporting pages, checks a quoted coverage passage before retaining a source-supported verdict, and checks proposed email addresses and phone numbers against page content. Unsupported contact details are removed; unsupported certainty is downgraded. Source-page reads overlap report formatting to reduce waiting.

Finally, the frontend creates the editable email and a downloadable **MIME `.eml` draft** with the photo attached. The **Web Share API** provides file sharing on supported phones. **ALTCHA** proof of work and API rate limits help protect the paid investigation endpoint without requiring user accounts.

## 4) Challenges we ran into

- **A nearby organization is not necessarily the owner.** City limits, numbered highways, campus boundaries, utility assets, and private roads can overlap. We use map facts and the reporter’s clues to guide research, while requiring page evidence for the stronger verdict.
- **A convincing AI answer is not enough.** Links can be invalid, a citation can point to the wrong page, and contact details can be unsupported. We added server-side page and contact checks rather than accepting model output at face value.
- **Public data services are not always available.** Map lookups can fail or take too long. The context layer supports fallback sources, and investigation caps its initial wait for context so a slow provider does not hold up the entire workflow.
- **Photos do not establish every fact.** A daylight picture of a streetlight does not prove an outage. The app uses the user’s note to distinguish a reported outage from something inferred only from the image, and can warn when that information is missing.
- **Email attachments behave differently across platforms.** A `mailto:` link cannot attach the photo. We provide a downloadable email with the attachment and supported mobile file sharing, while making the limitations of the mail-app and copy actions explicit.
- **Useful location context comes with privacy responsibilities.** We extract optional GPS locally, remove original metadata from the prepared image, require a confirmed pin, and disclose what goes to Gemini instead of claiming that AI analysis is entirely local or anonymous.

## 5) Accomplishments that we're proud of

- **Connecting discovery to action.** The workflow does more than describe damage: it helps identify a destination and prepares an editable report with photo evidence.
- **Making uncertainty part of the interface.** Users can see the difference between an official-site-supported result and a candidate that needs review, alongside the sources used.
- **Checking contact details before offering them.** The backend verifies published contacts and can leave the recipient blank when it cannot substantiate an address.
- **Combining visual and geographic context.** A photo, an exact pin, road and campus facts, and a short human note contribute different clues to the same investigation.
- **Keeping the user in control.** There is no automatic submission, account requirement, or application report database. The user can inspect the evidence, change the message, and choose whether to send it.

## 6) What we learned

- **Routing is often harder than recognition.** Recognizing a pothole is only the start; identifying the organization responsible for that particular stretch of road is the more useful problem to solve.
- **Grounding and verification are different jobs.** Search gives the model material to reason from. Separate server checks are still needed to decide which claims and contacts the interface should present.
- **Human context can outweigh another data source.** A pole number, HOA name, or observation about when a light goes dark can resolve ambiguity that a photo or address cannot.
- **Honest uncertainty makes results more actionable.** A clearly labeled best match with inspectable evidence is more useful than an unjustified guarantee.
- **The final handoff matters.** A workflow is not complete just because it produces text. Editable fields, attachment handling, device support, and clear sending behavior determine whether someone can actually use the report.

## 7) Built With

| Technology | Role |
|---|---|
| TypeScript | Shared frontend and backend types and application logic |
| React | Step-by-step reporting interface and results view |
| Vite | Frontend development server and production build |
| CSS, Lucide React, Public Sans and Big Shoulders fonts | Responsive layout, icons, and typography |
| Node.js and Express | API server and investigation orchestration |
| Google Gemini API | Multimodal issue analysis and research-to-report generation |
| Google Search grounding and URL context | Live source discovery and page research |
| Leaflet and OpenStreetMap | Interactive map and geographic data |
| Overpass API and Nominatim | Road, campus, streetlight, and address lookups |
| U.S. Census Bureau geographic data | U.S. municipality and county context |
| Zod | Structured report schema and validation |
| exifr and Canvas API | Local photo GPS extraction, resizing, and metadata removal |
| ALTCHA and express-rate-limit | Proof-of-work bot protection and request limits |
| DOMPurify | Sanitizing search-suggestion HTML before rendering |
| Web Share API and MIME `.eml` files | User-controlled handoff with photo attachments |

Recording manuscript: [Introduction video script](video-script.md).

Devpost thumbnail: [thumbnail.png](thumbnail.png) (1500×1000 PNG, 3:2, 74 KB).

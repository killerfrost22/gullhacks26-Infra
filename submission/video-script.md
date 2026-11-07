# Fix Please — Introduction Video Manuscript

**Target length:** approximately 2 minutes 30 seconds, including screen transitions.  
**Format:** screen recording with voiceover; use one real pothole report throughout.  
**Audience:** hackathon judges and first-time users.  
**Recording approach:** desktop walkthrough for readable text; use a separate phone capture only if showing the mobile share sheet.

Read the **Voiceover** passages aloud. **Screen** directions describe what to record; **Overlay** text is added during editing, not an existing app feature. Timings are editing targets, not claims about lookup speed.

## Before recording

- Start the app using the instructions in the [project README](../README.md#run-it-locally). Live investigation needs a configured Gemini API key with access to search grounding and a working internet connection.
- Choose a real, non-emergency maintenance issue and a photo you have permission to use. Know its actual location. Avoid faces, license plates, private information, and unsafe filming positions.
- Use a JPEG, PNG, or WebP photo under 15 MB. Convert HEIC photos before the demo.
- Rehearse the photo → pin → note → investigation → sources → email flow with that same issue. Use truthful location details, not invented observations or a staged authority response.
- Read the returned sources before filming. Keep the actual confidence label visible; do not turn a best match into a verified result in the edit. If no useful source is returned, choose another real issue for the main walkthrough rather than manufacturing evidence.
- Keep notifications and personal mail out of frame. Leave enough lookup quota for the take; the default investigation limit is five reports per IP address per 15 minutes.
- Record the full investigation wait. You can shorten it in the edit, but label the cut **“Lookup shortened for video.”** The animated stages are progress copy, not a live trace of individual backend operations.
- For this desktop walkthrough, show **Download email with photo**. On supported phones, **Send with photo** opens the system share sheet instead; use an actual phone over HTTPS to film that variation.
- Do not send a duplicate or test report to a public office. End at the draft or downloaded email.

## Screen 1 — The problem and the promise | 00:00–00:15

**Screen:** Start on the landing page with the Fix Please brand and the headline visible. Briefly point to the photo upload area.

**Voiceover:**

> A pothole is easy to notice. Figuring out who fixes it is harder. Is it the city, the state, or a property manager? Fix Please helps turn that uncertainty into a report you can actually send.

**Overlay:** From “someone should fix this” to a report.

## Screen 2 — Snap the problem | 00:15–00:30

**Screen:** In **Snap the problem**, click **Choose a photo** and upload the real pothole photo. Pause on the prepared preview.

**Voiceover:**

> Start with a clear photo. Fix Please prepares it on your device, reducing its size and removing hidden metadata before upload. If the original photo includes GPS, it can suggest where the problem is.

**Overlay:** Photo first. Hidden metadata removed.

## Screen 3 — Pin the exact spot | 00:30–00:47

**Screen:** In **Pin the spot**, search for the real address or place. Select the result, adjust the pin to the issue, and click **Yes, it’s here**. Keep any available road or campus context chips in frame.

**Voiceover:**

> Next, confirm the exact spot. Search an address, use your location, or move the map pin. This matters because neighboring roads can have different owners, and a campus address does not automatically mean campus facilities maintains the road.

**Overlay:** Exact location changes who is responsible.

## Screen 4 — Add the missing context | 00:47–01:02

**Screen:** In **Guide the AI**, add one short, accurate note about the pothole’s position, such as its lane or a nearby landmark. Do not enter an example that is untrue for this photo.

**Voiceover:**

> Add any detail the photo cannot explain: which lane, a nearby landmark, a pole number, or an HOA name. These clues help narrow the search instead of treating every problem as a generic city maintenance request.

**Overlay:** A small detail can change the destination.

## Screen 5 — Investigate | 01:02–01:19

**Screen:** Click **Investigate & Find Office**. Show the investigation state, then transition into the real result. If shortening the wait, use the disclosure from the recording checklist.

**Voiceover:**

> Now Fix Please combines the photo, confirmed pin, and note with available map facts. Gemini searches official sites for the likely responsible organization. The server checks supporting pages and published contacts before presenting the report.

**Overlay:** Photo + location + context + official sources.

## Screen 6 — Show the evidence, not just an answer | 01:19–01:41

**Screen:** Frame the responsible organization, explanation, and actual verdict badge together. Scroll to **How we know** and open a returned source. Return to the app without hiding warnings. If the result has no published email, show that honestly.

**Voiceover:**

> The result explains who likely handles the issue and why. It distinguishes official-site support from a best match that still needs checking. We can inspect the sources ourselves, and an email address only appears if the server found it published on a supporting page.

**Overlay:** Evidence visible. Uncertainty visible.

## Screen 7 — Review a report you can send | 01:41–02:02

**Screen:** Focus on **Your email**. Show the editable **To**, **Subject**, and **Message** fields and the photo attachment. Make a small, truthful edit to the wording. Click **Download email with photo** and show the download confirmation; stop before sending anything.

**Voiceover:**

> Fix Please creates an editable email with the issue, location, and photo. On desktop, download the email with its attachment. Supported phones can share the photo and message to a mail app. You review the recipient and wording. Nothing is sent automatically.

**Overlay:** Review first. You stay in control.

## Screen 8 — Privacy and the build | 02:02–02:19

**Screen:** Open **Privacy & Transparency**. Frame **What gets sent**, **What we keep**, and **Sending**. Use a brief stack caption over the recording, without covering the privacy text.

**Voiceover:**

> We built Fix Please with React, TypeScript, a Node and Express backend, Gemini, and open map data. There are no accounts or report database. Gemini receives the photo, pin, and note; search-backed requests may be retained for up to thirty days.

**Overlay:** React · TypeScript · Node.js · Gemini · OpenStreetMap

## Screen 9 — Close on the outcome | 02:19–02:30

**Screen:** Close the privacy dialog and return to the result, keeping the responsible office and draft visible. Finish with the brand and `fixplease.app` as an end card.

**Voiceover:**

> Fix Please does not repair the road. It helps you take the next step: finding who to contact and preparing a useful report. See something broken? Snap it. We’ll find who fixes it.

**Overlay:** Fix Please — less searching, more reporting.

## Final recording checks

- Keep source links, the actual verdict, and any relevant warnings readable.
- If the email recipient is blank, explain that no public address was found and show the official reporting link. Do not imply that every office accepts email.
- **Mail app** and **Copy** do not attach the photo automatically. Do not present them as equivalent to downloading the attached email or sharing a file.
- Do not claim the app submitted a report, guarantees jurisdiction, tracks repairs, or guarantees a response.
- Keep the closing invitation about routine maintenance. Emergencies require local emergency services, not Fix Please.

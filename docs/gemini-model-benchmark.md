# Gemini model benchmark

Run on 2026-11-07 to choose the model that reads the photo and finds who fixes the problem.

**Decision: Fix Please uses `gemini-3.6-flash`.** It is the default in the code and in `.env.example`. Override it with `GEMINI_MODEL`.

## Summary

- Seven distinct models could run the app's research request. **All seven got the issue type and the responsible office right in every test case**, including the previous default, `gemini-3.5-flash-lite`.
- The models differed in speed, in how many Google searches they ran, and in how detailed their photo descriptions were.
- `gemini-3.6-flash` was chosen because it:
  - was correct every time
  - wrote clearly more precise descriptions than the Flash-Lite models
  - took 21 s in its slowest run, inside the app's 45 s limit for a whole report
  - costs under 1¢ in tokens per report

  The trade-offs are about 4× Flash-Lite's token cost and about 3× its searches. Searches are what cost money at scale (see [Cost](#cost)).
- `gemini-3.8-flash` costs the same per token but ran about twice as many searches and took about twice as long, with runs near or over 45 s. `gemini-4-argon` and `gemini-3.1-pro-preview` are too slow for the app.
- These were easy, unambiguous cases (four photos, one run per model name per case). They show cost and speed well, but they are a weak test of accuracy on hard, real-world reports. Re-test with any photo and pin that gives a wrong answer.

## Results by model

Times are for the research request only (see [Method](#method)). Model names that Google redirected to another model are merged into the model that actually answered; see [Aliases](#aliases).

| Model | Runs | Median time | Fastest | Slowest | Runs over 45 s | Median tokens | Mean tokens | Max tokens | Searches per report (avg / max) | Token cost per report (median / mean) | Issue kind right | Office right |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` (previous default) | 8 | 5.0 s | 3.3 s | 7.9 s | 0 | 2,426 | 2,476 | 2,896 | 3.6 / 8 | 0.16¢ / 0.17¢ | 8/8 | 8/8 |
| `gemini-3.1-flash-lite` | 8 | 5.8 s | 3.6 s | 7.7 s | 0 | 2,854 | 3,002 | 3,668 | 3.1 / 4 | 0.16¢ / 0.18¢ | 8/8 | 8/8 |
| `gemini-3-flash-preview` | 4 | 6.5 s | 4.9 s | 8.1 s | 0 | 2,460 | 2,489 | 2,618 | 4.8 / 5 | 0.23¢ / 0.24¢ | 4/4 | 4/4 |
| **`gemini-3.6-flash` (chosen)** | 8 | 12.7 s | 7.3 s | 20.8 s | 0 | 3,615 | 7,797 | 21,018 | 9.8 / 23 | 0.63¢ / 0.95¢ | 8/8 | 8/8 |
| `gemini-3.1-pro-preview` | 8 | 21.1 s | 12.4 s | 46.4 s | 1 | 4,605 | 18,499 | 87,613 | 7.5 / 22 | 2.65¢ / 5.25¢ | 8/8 | 8/8 |
| `gemini-3.8-flash` | 12 | 21.7 s | 9.6 s | 48.8 s | 1 | 3,424 | 20,439 | 101,831 | 19.0 / 50 | 0.62¢ / 1.80¢ | 12/12 | 12/12 |
| `gemini-4-argon` | 3 + 1 timeout | 78.6 s | 55.6 s | over 180 s | all 4 | 4,020 | 4,183 | 4,941 | 13.3 / 17 | 2.13¢ / 2.29¢ | 3/3 | 3/3 |

### Where the tokens go

Averages per report. "Rest of input" is the prompt, the pin, and the map facts, plus any hidden tool instructions Google adds. "Search & pages" is the search-result and web-page text the model pulled in through Google Search and URL context. It is billed as input and causes almost all of the variation.

| Model | Image | Rest of input | Thinking | Output | Search & pages | Total (mean) | Total (max) |
|---|---|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | 1,072 | 972 | 0 | 432 | 0 | 2,476 | 2,896 |
| `gemini-3.1-flash-lite` | 1,072 | 1,073 | 491 | 366 | 0 | 3,002 | 3,668 |
| `gemini-3-flash-preview` | 1,072 | 972 | 0 | 444 | 0 | 2,489 | 2,618 |
| `gemini-3.6-flash` | 1,072 | 1,317 | 793 | 428 | 4,187 | 7,797 | 21,018 |
| `gemini-3.1-pro-preview` | 1,072 | 1,469 | 1,142 | 405 | 14,411 | 18,499 | 87,613 |
| `gemini-3.8-flash` | 1,072 | 1,136 | 288 | 604 | 17,340 | 20,439 | 101,831 |
| `gemini-4-argon` | 1,075 | 1,286 | 0 | 1,822 | 0 | 4,183 | 4,941 |

`gemini-4-argon` reported no separate thinking tokens, so its output count probably includes its thinking. The photo costs the same for every model, about 1,070 tokens for an image up to 1,920 px.

### Cost

Paid-tier prices from [Google's pricing page](https://ai.google.dev/gemini-api/docs/pricing), read on 2026-11-07:

| Model | Input per 1M tokens | Output per 1M tokens (incl. thinking) |
|---|---|---|
| `gemini-3.5-flash-lite` | $0.30 | $2.50 |
| `gemini-3.1-flash-lite` | $0.25 | $1.50 |
| `gemini-3-flash-preview` | $0.50 | $3.00 |
| `gemini-3.6-flash` | $0.75 | $3.75 |
| `gemini-3.1-pro-preview` | $2.00 | $12.00 |
| `gemini-3.8-flash` | $0.75 | $3.75 |
| `gemini-4-argon` | $2.00 ($4.00 from 2026-12-01) | $10.00 ($20.00 from 2026-12-01) |

**Searches cost more than tokens.** All Gemini 3 and newer models share 5,000 free Google searches a month per project. After that, each search costs 1.4¢ ($14 per 1,000), with a cap of 1,500 search requests a day.

| Model | Searches per report | Reports a month inside the free 5,000 searches | Search cost per report after that |
|---|---|---|---|
| `gemini-3.1-flash-lite` | 3.1 | about 1,600 | 4.3¢ |
| `gemini-3.5-flash-lite` | 3.6 | about 1,390 | 5.0¢ |
| `gemini-3-flash-preview` | 4.8 | about 1,040 | 6.7¢ |
| `gemini-3.1-pro-preview` | 7.5 | about 670 | 10.5¢ |
| **`gemini-3.6-flash`** | 9.8 | about 510 | 13.7¢ |
| `gemini-4-argon` | 13.3 | about 380 | 18.6¢ |
| `gemini-3.8-flash` | 19.0 | about 260 | 26.6¢ |

The search count is whatever the model chooses for a request. It ranged from 3 to 23 for `gemini-3.6-flash` and from 2 to 50 for `gemini-3.8-flash`. If search spend becomes a problem, cap searches in the prompt or set a Google Cloud budget alert.

### Description quality

Every model described every photo correctly. The larger models were more specific. Here is how each run described the damaged streetlight (case C). One arm has lost its whole lamp and has a wire sticking out; the other has a bare bulb with no glass.

| Model | What it said |
|---|---|
| `gemini-3.5-flash-lite` | "one bulb missing or broken and another fixture bare"; "one fixture is missing a bulb/cover and another has an exposed bulb" |
| `gemini-3.1-flash-lite` | "one of the lamp fixtures is missing its cover or shade, and the other side appears to be a bare bulb"; the other run only said "one bulb missing or broken" |
| `gemini-3-flash-preview` | "The left lamp fixture is missing its bulb and housing, leaving only the internal components exposed. The right fixture has a bulb but appears to be missing a globe or cover." |
| **`gemini-3.6-flash`** | "one side is missing its light fixture entirely (leaving exposed wires) and the other side has an exposed bulb missing its protective globe" |
| `gemini-3.1-pro-preview` | "The right arm has an exposed bulb, while the left arm is missing its bulb and housing"; the other run only said "one of its two glass fixtures or bulbs is missing" |
| `gemini-3.8-flash` | "The left luminaire is completely missing with exposed wires protruding, and the right arm has an exposed bulb without an enclosing globe or lantern casing." |
| `gemini-4-argon` | "both outer globes/luminaires are missing, the left arm has an empty socket with exposed wire, and the right arm has an exposed bare bulb" |

On the collapsed street (case D), `gemini-3.8-flash` and `gemini-4-argon` also noticed the manhole cover next to the hole, which helps an office find the spot and the likely cause.

## Models that couldn't be tested

| Model | Why |
|---|---|
| `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro` | Google: "no longer available to new users". This project's key can't call them. |
| `gemini-omni-flash-preview`, `gemini-omni-1.1-flash`, `gemini-omni-1.2-flash` | "Search as tool is not enabled for this model". The app needs Google Search. |
| TTS, image-generation (Nano Banana), transcription, robotics, computer-use, and `gemini-3.1-pro-preview-customtools` | Built for other jobs: they can't take a photo and return a researched text answer, or they duplicate a model above. |

## Aliases

Several model names are aliases. Google answered with a different model, shown in the response's `model` field:

| Requested | Answered by |
|---|---|
| `gemini-flash-latest`, `gemini-3.7-flash` | `gemini-3.8-flash` |
| `gemini-3.5-flash` | `gemini-3.6-flash` |
| `gemini-flash-lite-latest` | `gemini-3.5-flash-lite` |
| `gemini-pro-latest` | `gemini-3.1-pro-preview` |
| `gemini-3.1-flash-lite-preview` | `gemini-3.1-flash-lite` |

Set `GEMINI_MODEL` to the exact model you mean. `-latest` names and older version names can silently start pointing at a different model.

## Method

- **Request:** the app's research call. It goes to the Gemini Interactions API (`POST /v1beta/interactions`, `api-revision: 2026-05-20`) with the app's research system instruction, the Google Search and URL context tools, `thinking_level: low` and `store: false`. The input is the app's text layout (pin label, coordinates, address parts, map facts) plus the photo, with no user note, so every model had to read the photo itself.
- **What was timed:** the time from sending the research request to receiving the full response. A real report also waits up to 4 s for map facts, runs a second Gemini call that formats the result as JSON, and checks the cited pages, all inside a 45 s limit. Real reports therefore take longer than the times above.
- **Photos:** re-encoded the way the app does it: longest side at most 1,920 px, JPEG quality 85, metadata removed.
- **Map facts:** the app gets road, campus, and streetlight facts from Overpass, but every public Overpass server timed out from the test network. The same facts were filled in from Nominatim (road name and route number, campus and website) and the U.S. Census geocoder (incorporated or not). Every model got identical input.
- **Runs:** one run per model name per case, run five models at a time. Runs through an alias count toward the model that answered, which is why some models have more runs.
- **Scoring:** "Issue kind right" means the model's `ISSUE_KIND` was in the accepted set for that case. "Office right" means the organization and department together named the expected office. Descriptions were judged by reading them against the photo.
- **Usage:** the test made 51 successful calls and 479 searches and cost about $0.82 in tokens.

### Test cases

Each case pairs a freely licensed photo with a pin whose maintaining office is certain. The app trusts the confirmed pin for location, so the photo doesn't have to come from that spot.

| Case | Photo | Pin and map facts | Correct office | Accepted issue kinds |
|---|---|---|---|---|
| A | Water-filled pothole ([Tdorante10](https://commons.wikimedia.org/wiki/File:Bch_169th_St_Ft_Tilden_Riis_Park_td_03.jpg), CC BY-SA 4.0) | Baltimore Avenue, College Park, MD. Incorporated city. Route ref **US 1**. | Maryland Department of Transportation State Highway Administration | pothole, road_damage |
| B | Cracked concrete sidewalk ([Downtowngal](https://commons.wikimedia.org/wiki/File:Cracked_sidewalk_1.jpg), CC BY-SA 4.0) | Library Lane, a footway on the University of Maryland campus (website umd.edu). | University of Maryland Facilities Management | sidewalk |
| C | Decorative streetlight missing its lamps ([Jules Verne Times Two](https://commons.wikimedia.org/wiki/File:Damaged_lamp_post,_Fira,_Santorini,_Greece_(approx._GPS_location)_julesvernex2.jpg), CC BY-SA 4.0) | West 86th Street, Manhattan, New York. Incorporated city. | New York City Department of Transportation (reported through 311) | streetlight |
| D | Collapsed street with a cave-in ([Infrogmation](https://commons.wikimedia.org/wiki/File:18ApSeabrookPothole1.jpg), CC BY 3.0) | Tecumseh Street, Adelphi, MD. **Unincorporated**: Adelphi is only a Census Designated Place, though the address says "town: Adelphi". | Prince George's County Department of Public Works and Transportation | pothole, road_damage, drainage |

### Re-running it

The benchmark script, test photos, and raw API responses were kept outside the repo, on the laptop that ran the test (`Documents/hackathons/gemini-bench/`). To re-run it, send the same request to each model and record the response's `usage` block (`total_input_tokens`, `input_tokens_by_modality`, `total_thought_tokens`, `total_output_tokens`, `total_tool_use_tokens`) and the `google_search_call` steps. The request is the one described in [Method](#method).

## Appendix: every run

Tokens are per run. Office names are as the model wrote them (organization / department).

| Requested | Answered by | Case | Time (s) | Input | Image | Thinking | Output | Search & pages | Total | Searches | Issue kind | Office named | Office right |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | A | 3.9 | 2,041 | 1,080 | 0 | 421 | 0 | 2,462 | 2 | pothole | Maryland Department of Transportation State Highway Administration / Maintenance Division | Yes |
| `gemini-flash-lite-latest` | `gemini-3.5-flash-lite` | A | 4.8 | 2,041 | 1,080 | 0 | 349 | 0 | 2,390 | 2 | pothole | Maryland Department of Transportation State Highway Administration / District 3 Office | Yes |
| `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | B | 6.9 | 2,047 | 1,064 | 0 | 216 | 0 | 2,263 | 8 | sidewalk | University of Maryland, College Park / Facilities Management | Yes |
| `gemini-flash-lite-latest` | `gemini-3.5-flash-lite` | B | 7.9 | 2,047 | 1,064 | 0 | 225 | 0 | 2,272 | 7 | sidewalk | University of Maryland, College Park / Facilities Management | Yes |
| `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | C | 3.9 | 2,035 | 1,064 | 0 | 861 | 0 | 2,896 | 2 | streetlight | New York City Department of Transportation / Division of Street Lighting Engineering | Yes |
| `gemini-flash-lite-latest` | `gemini-3.5-flash-lite` | C | 3.3 | 2,035 | 1,064 | 0 | 340 | 0 | 2,375 | 2 | streetlight | New York City Department of Transportation / Division of Street Lighting Engineering | Yes |
| `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | D | 5.2 | 2,054 | 1,080 | 0 | 568 | 0 | 2,622 | 4 | drainage | Prince George's County Government / Department of Public Works and Transportation (DPW&T), Office of Highway Maintenance / Office of Storm Drain Maintenance | Yes |
| `gemini-flash-lite-latest` | `gemini-3.5-flash-lite` | D | 5.7 | 2,054 | 1,080 | 0 | 473 | 0 | 2,527 | 2 | road_damage | Prince George's County Government / Department of Public Works and Transportation | Yes |
| `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | A | 3.6 | 2,041 | 1,080 | 113 | 340 | 0 | 2,494 | 0 | pothole | Maryland Department of Transportation (MDOT) State Highway Administration / Office of Maintenance | Yes |
| `gemini-3.1-flash-lite-preview` | `gemini-3.1-flash-lite` | A | 7.6 | 2,142 | 1,080 | 591 | 585 | 0 | 3,318 | 4 | pothole | Maryland Department of Transportation (MDOT) State Highway Administration (SHA) / District 3 Office | Yes |
| `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | B | 6.0 | 2,145 | 1,064 | 385 | 306 | 0 | 2,836 | 3 | sidewalk | University of Maryland, College Park / Facilities Management (Building and Landscape Maintenance) | Yes |
| `gemini-3.1-flash-lite-preview` | `gemini-3.1-flash-lite` | B | 5.5 | 2,194 | 1,064 | 301 | 308 | 0 | 2,803 | 4 | sidewalk | University of Maryland, College Park / Facilities Management | Yes |
| `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | C | 5.7 | 2,154 | 1,064 | 928 | 297 | 0 | 3,379 | 3 | streetlight | New York City Department of Transportation (NYC DOT) / Division of Street Lighting Engineering | Yes |
| `gemini-3.1-flash-lite-preview` | `gemini-3.1-flash-lite` | C | 3.9 | 2,145 | 1,064 | 209 | 295 | 0 | 2,649 | 3 | streetlight | New York City Department of Transportation (NYC DOT) / Division of Street Lighting Engineering | Yes |
| `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | D | 7.7 | 2,161 | 1,080 | 1,100 | 407 | 0 | 3,668 | 4 | road_damage | Prince George's County Department of Public Works and Transportation / Office of Highway Maintenance | Yes |
| `gemini-3.1-flash-lite-preview` | `gemini-3.1-flash-lite` | D | 5.9 | 2,179 | 1,080 | 300 | 393 | 0 | 2,872 | 4 | road_damage | Prince George's County Department of Public Works and Transportation / Office of Highway Maintenance | Yes |
| `gemini-3-flash-preview` | `gemini-3-flash-preview` | A | 7.2 | 2,041 | 1,080 | 0 | 415 | 0 | 2,456 | 5 | pothole | Maryland Department of Transportation State Highway Administration / District 3 Office | Yes |
| `gemini-3-flash-preview` | `gemini-3-flash-preview` | B | 5.8 | 2,047 | 1,064 | 0 | 417 | 0 | 2,464 | 5 | sidewalk | University of Maryland, College Park / Facilities Management | Yes |
| `gemini-3-flash-preview` | `gemini-3-flash-preview` | C | 4.9 | 2,035 | 1,064 | 0 | 381 | 0 | 2,416 | 4 | streetlight | New York City Department of Transportation / Division of Street Lighting | Yes |
| `gemini-3-flash-preview` | `gemini-3-flash-preview` | D | 8.1 | 2,054 | 1,080 | 0 | 564 | 0 | 2,618 | 5 | road_damage | Prince George's County / Department of Public Works and Transportation (DPW&T) | Yes |
| `gemini-3.5-flash` | `gemini-3.6-flash` | A | 7.3 | 2,156 | 1,080 | 376 | 416 | 0 | 2,948 | 4 | pothole | Maryland Department of Transportation State Highway Administration / District 3 | Yes |
| `gemini-3.6-flash` | `gemini-3.6-flash` | A | 12.9 | 2,455 | 1,080 | 1,074 | 510 | 16,979 | 21,018 | 3 | pothole | Maryland Department of Transportation State Highway Administration / District 3 | Yes |
| `gemini-3.5-flash` | `gemini-3.6-flash` | B | 20.8 | 2,486 | 1,064 | 761 | 204 | 0 | 3,451 | 22 | sidewalk | University of Maryland / Department of Facilities Management | Yes |
| `gemini-3.6-flash` | `gemini-3.6-flash` | B | 17.4 | 2,246 | 1,064 | 664 | 212 | 0 | 3,122 | 23 | sidewalk | University of Maryland / Facilities Management | Yes |
| `gemini-3.5-flash` | `gemini-3.6-flash` | C | 8.6 | 2,195 | 1,064 | 842 | 441 | 0 | 3,478 | 4 | streetlight | New York City Department of Transportation / Division of Traffic Operations | Yes |
| `gemini-3.6-flash` | `gemini-3.6-flash` | C | 9.9 | 2,664 | 1,064 | 641 | 446 | 0 | 3,751 | 8 | streetlight | New York City Department of Transportation / Division of Traffic Operations | Yes |
| `gemini-3.5-flash` | `gemini-3.6-flash` | D | 15.7 | 2,554 | 1,080 | 1,017 | 607 | 16,514 | 20,692 | 7 | road_damage | Prince George's County Department of Public Works and Transportation / Office of Highway Maintenance | Yes |
| `gemini-3.6-flash` | `gemini-3.6-flash` | D | 12.5 | 2,354 | 1,080 | 968 | 591 | 0 | 3,913 | 7 | road_damage | Prince George's County / Department of Public Works and Transportation, Office of Highway Maintenance, Road Maintenance Division | Yes |
| `gemini-3.1-pro-preview` | `gemini-3.1-pro-preview` | A | 12.7 | 2,147 | 1,080 | 842 | 389 | 0 | 3,378 | 2 | pothole | Maryland Department of Transportation / State Highway Administration | Yes |
| `gemini-pro-latest` | `gemini-3.1-pro-preview` | A | 20.7 | 2,879 | 1,080 | 1,758 | 366 | 0 | 5,003 | 3 | pothole | Maryland Department of Transportation State Highway Administration / Office of Maintenance | Yes |
| `gemini-3.1-pro-preview` | `gemini-3.1-pro-preview` | B | 46.4 | 3,007 | 1,064 | 1,479 | 201 | 0 | 4,687 | 22 | sidewalk | University of Maryland / Facilities Management | Yes |
| `gemini-pro-latest` | `gemini-3.1-pro-preview` | B | 43.7 | 2,577 | 1,064 | 699 | 332 | 84,005 | 87,613 | 16 | sidewalk | University of Maryland / Facilities Management | Yes |
| `gemini-3.1-pro-preview` | `gemini-3.1-pro-preview` | C | 12.4 | 2,146 | 1,064 | 878 | 331 | 0 | 3,355 | 2 | streetlight | City of New York / Department of Transportation | Yes |
| `gemini-pro-latest` | `gemini-3.1-pro-preview` | C | 19.7 | 2,414 | 1,064 | 1,046 | 262 | 0 | 3,722 | 6 | streetlight | New York City Department of Transportation / Division of Street Lighting Engineering | Yes |
| `gemini-3.1-pro-preview` | `gemini-3.1-pro-preview` | D | 21.5 | 2,410 | 1,080 | 1,150 | 874 | 31,279 | 35,713 | 2 | road_damage | Prince George's County Department of Public Works and Transportation / Road Maintenance and Road Construction Division | Yes |
| `gemini-pro-latest` | `gemini-3.1-pro-preview` | D | 25.7 | 2,751 | 1,080 | 1,284 | 487 | 0 | 4,522 | 7 | road_damage | Prince George's County Department of Public Works & Transportation / Office of Highway Maintenance | Yes |
| `gemini-3.7-flash` | `gemini-3.8-flash` | A | 13.2 | 2,041 | 1,080 | 0 | 535 | 0 | 2,576 | 9 | pothole | Maryland Department of Transportation State Highway Administration / District 3 (Laurel Shop) | Yes |
| `gemini-3.8-flash` | `gemini-3.8-flash` | A | 16.7 | 2,041 | 1,080 | 0 | 761 | 21,014 | 23,816 | 7 | pothole | Maryland Department of Transportation State Highway Administration / District 3 (Laurel Maintenance Facility) | Yes |
| `gemini-flash-latest` | `gemini-3.8-flash` | A | 10.3 | 2,041 | 1,080 | 0 | 479 | 0 | 2,520 | 4 | pothole | Maryland Department of Transportation State Highway Administration / District 3 | Yes |
| `gemini-3.7-flash` | `gemini-3.8-flash` | B | 40.1 | 2,047 | 1,064 | 0 | 1,153 | 98,631 | 101,831 | 37 | sidewalk | University of Maryland / Facilities Management | Yes |
| `gemini-3.8-flash` | `gemini-3.8-flash` | B | 43.2 | 2,047 | 1,064 | 0 | 471 | 0 | 2,518 | 50 | sidewalk | University of Maryland, College Park / Facilities Management | Yes |
| `gemini-flash-latest` | `gemini-3.8-flash` | B | 37.5 | 2,047 | 1,064 | 0 | 715 | 0 | 2,762 | 38 | sidewalk | University of Maryland, College Park / Facilities Management | Yes |
| `gemini-3.7-flash` | `gemini-3.8-flash` | C | 23.7 | 2,406 | 1,064 | 1,264 | 415 | 0 | 4,085 | 10 | streetlight | New York City Department of Transportation / Division of Traffic Operations | Yes |
| `gemini-3.8-flash` | `gemini-3.8-flash` | C | 48.8 | 3,630 | 1,064 | 2,191 | 465 | 41,745 | 48,031 | 39 | streetlight | New York City Department of Transportation / Division of Traffic Operations | Yes |
| `gemini-flash-latest` | `gemini-3.8-flash` | C | 35.8 | 2,035 | 1,064 | 0 | 521 | 31,351 | 33,907 | 21 | streetlight | New York City Department of Transportation / Division of Traffic Operations | Yes |
| `gemini-3.7-flash` | `gemini-3.8-flash` | D | 19.7 | 2,054 | 1,080 | 0 | 616 | 15,335 | 18,005 | 5 | road_damage | Prince George's County Department of Public Works and Transportation / Office of Highway Maintenance, Road Maintenance and Road Construction Division | Yes |
| `gemini-3.8-flash` | `gemini-3.8-flash` | D | 9.6 | 2,054 | 1,080 | 0 | 577 | 0 | 2,631 | 2 | road_damage | Prince George's County Department of Public Works and Transportation / Office of Highway Maintenance, Road Maintenance Division | Yes |
| `gemini-flash-latest` | `gemini-3.8-flash` | D | 17.6 | 2,054 | 1,080 | 0 | 536 | 0 | 2,590 | 6 | road_damage | Prince George's County Department of Public Works and Transportation / Office of Highway Maintenance, Road Maintenance and Road Construction Division | Yes |
| `gemini-4-argon` | `gemini-4-argon` | A | 78.6 | 2,359 | 1,080 | 0 | 1,661 | 0 | 4,020 | 14 | pothole | Maryland Department of Transportation State Highway Administration (MDOT SHA) / District 3 Office (Laurel Maintenance Shop) | Yes |
| `gemini-4-argon` | `gemini-4-argon` | B | over 180 | | | | | | | | | No answer: timed out after 180 s | No |
| `gemini-4-argon` | `gemini-4-argon` | C | 55.6 | 2,353 | 1,064 | 0 | 1,235 | 0 | 3,588 | 9 | streetlight | New York City Department of Transportation / Division of Traffic Operations, Street Lighting Unit | Yes |
| `gemini-4-argon` | `gemini-4-argon` | D | 80.9 | 2,372 | 1,080 | 0 | 2,569 | 0 | 4,941 | 17 | road_damage | Prince George's County Department of Public Works and Transportation / Office of Highway Maintenance, Road Maintenance and Road Construction Division | Yes |

Calls that failed before answering (cases A–C; case D was only run on models that worked):

| Model | Error |
|---|---|
| `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro` | "This model … is no longer available to new users." |
| `gemini-omni-flash-preview`, `gemini-omni-1.1-flash`, `gemini-omni-1.2-flash` | "Search as tool is not enabled for this model" |

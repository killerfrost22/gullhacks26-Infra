# Gemini model benchmark

Data and scripts behind [docs/gemini-model-benchmark.md](../../docs/gemini-model-benchmark.md), which explains the results and why the app uses `gemini-3.6-flash`.

```
bench.mjs                 Sends the app's research request to each model for each test case
summarize.mjs             Per-model medians, token breakdown, searches, cost, and accuracy for one run
photos/                   The four test photos (caseA–D.jpg), re-encoded the way the app does it
results/2026-11-07/
  results.jsonl           One line per call: model, time, tokens, searches, parsed answer, scores
  summary.json            Output of summarize.mjs for this run
  raw/                    Full API response for every call, <model>__<case>.json
```

## Running it

**It costs money.** A full run makes about 70 calls to the Gemini API and about 480 Google searches. On 2026-11-07 that was about $0.82 in tokens. The searches come out of the project's 5,000 free searches a month, shared by all Gemini 3+ models, and after that cost $14 per 1,000.

Run it from the repo root. The key comes from `GEMINI_API_KEY` in the environment, or from the repo's `.env`.

```bash
node benchmarks/gemini-models/bench.mjs
node benchmarks/gemini-models/summarize.mjs > benchmarks/gemini-models/results/<date>/summary.json
```

Options, as environment variables:

| Variable | Default | Use |
|---|---|---|
| `MODELS` | Every model in the 2026-11-07 run | Comma-separated model names, e.g. `MODELS=gemini-3.6-flash,gemini-3.8-flash` |
| `CASES` | `A,B,C,D` | Which test cases to run |
| `CONCURRENCY` | `5` | How many models run at the same time |
| `OUT` | `results/<today>` | Where results go. Runs append to `results.jsonl`, so give each new run its own folder. |

`bench.mjs` copies the research prompt from the rebuild's `server/research/prompt.ts` as it was on 2026-11-07. If the app's prompt changes, update the copy before re-running, or the numbers won't reflect the app. `summarize.mjs` re-scores every call, so its accuracy columns are the ones to trust.

The `orgOk` field in the 2026-11-07 `results.jsonl` was scored by an earlier version that checked only the organization field. It marks some correct answers as wrong, for example "City of New York" with the department "Department of Transportation". The current scoring, which both scripts now use, is in `summary.json` and in the write-up.

## Photo credits

All four photos are from Wikimedia Commons. They are resized copies, shared under the same licenses as the originals.

| File | Original | Author | License |
|---|---|---|---|
| `photos/caseA.jpg` | [Bch 169th St Ft Tilden Riis Park td 03.jpg](https://commons.wikimedia.org/wiki/File:Bch_169th_St_Ft_Tilden_Riis_Park_td_03.jpg) | Tdorante10 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `photos/caseB.jpg` | [Cracked sidewalk 1.jpg](https://commons.wikimedia.org/wiki/File:Cracked_sidewalk_1.jpg) | Downtowngal | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `photos/caseC.jpg` | [Damaged lamp post, Fira, Santorini, Greece (approx. GPS location) julesvernex2.jpg](https://commons.wikimedia.org/wiki/File:Damaged_lamp_post,_Fira,_Santorini,_Greece_(approx._GPS_location)_julesvernex2.jpg) | Jules Verne Times Two | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `photos/caseD.jpg` | [18ApSeabrookPothole1.jpg](https://commons.wikimedia.org/wiki/File:18ApSeabrookPothole1.jpg) | Infrogmation | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |

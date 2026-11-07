// Summarizes one benchmark run: node summarize.mjs [results/<date>] (defaults to the newest run). Prints JSON.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const RESULTS = path.join(import.meta.dirname, 'results');
const runDir = path.resolve(process.argv[2] ?? path.join(RESULTS, readdirSync(RESULTS).sort().at(-1)));

const EXPECT = {
  A: { kind: ['pothole', 'road_damage'], org: /state highway administration|\bSHA\b|maryland department of transportation|\bMDOT\b/i },
  B: { kind: ['sidewalk'], org: /facilities management|university of maryland/i },
  C: { kind: ['streetlight'], org: /(new york city|\bNYC\b|city of new york).*(department of transportation|\bDOT\b)|\bNYC ?DOT\b|department of transportation.*(new york city|\bNYC\b)/i },
  D: { kind: ['pothole', 'road_damage', 'drainage'], org: /prince george.?s county.*(public works|transportation|\bDPW)|\bDPW&?T\b|PGC ?311/i },
};
// Score organization + department together: "City of New York" / "Department of Transportation" is a correct answer.
const rows = readFileSync(path.join(runDir, 'results.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((r) => ({
  ...r,
  kindOk: !!r.kind && EXPECT[r.case].kind.includes(r.kind.toLowerCase().replace(/[^a-z_]/g, '')),
  orgOk: EXPECT[r.case].org.test(`${r.org ?? ''} ${r.department ?? ''}`),
}));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const mean = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
// Paid-tier USD per 1M tokens from ai.google.dev/gemini-api/docs/pricing (fetched 2026-11-07). Tool-use tokens bill as input.
const PRICE = {
  'gemini-3-flash-preview': [0.5, 3], 'gemini-3.1-flash-lite': [0.25, 1.5], 'gemini-3.1-pro-preview': [2, 12],
  'gemini-3.5-flash-lite': [0.3, 2.5], 'gemini-3.6-flash': [0.75, 3.75], 'gemini-3.8-flash': [0.75, 3.75], 'gemini-4-argon': [2, 10],
};
const tokenCost = (r) => {
  const [inP, outP] = PRICE[r.servedModel] ?? [NaN, NaN];
  return (((r.tokens.input ?? 0) + (r.tokens.toolUse ?? 0)) * inP + ((r.tokens.thought ?? 0) + (r.tokens.output ?? 0)) * outP) / 1e6;
};
const GROUP = process.env.GROUP ?? 'served';

const groups = new Map();
for (const r of rows) {
  const key = GROUP === 'served' && !r.error ? r.servedModel : r.model;
  groups.set(key, [...(groups.get(key) ?? []), r]);
}

const ok = [];
const failed = [];
for (const [model, rs] of groups) {
  const good = rs.filter((r) => !r.error);
  if (!good.length) { failed.push({ model, error: rs[0].error }); continue; }
  ok.push({
    model,
    via: [...new Set(good.map((r) => r.model))].join(', '),
    samples: good.length,
    medianMs: median(good.map((r) => r.ms)),
    minMs: Math.min(...good.map((r) => r.ms)),
    maxMs: Math.max(...good.map((r) => r.ms)),
    over45: good.filter((r) => r.ms > 45_000).length,
    image: mean(good.map((r) => r.tokens.image ?? 0)),
    input: mean(good.map((r) => r.tokens.input ?? 0)),
    thought: mean(good.map((r) => r.tokens.thought ?? 0)),
    output: mean(good.map((r) => r.tokens.output ?? 0)),
    toolUse: mean(good.map((r) => r.tokens.toolUse ?? 0)),
    medianTotal: median(good.map((r) => r.tokens.total ?? 0)),
    meanTotal: mean(good.map((r) => r.tokens.total ?? 0)),
    maxTotal: Math.max(...good.map((r) => r.tokens.total ?? 0)),
    queries: (good.reduce((a, r) => a + r.searchQueries, 0) / good.length).toFixed(1),
    maxQueries: Math.max(...good.map((r) => r.searchQueries)),
    medianTokenCostCents: (median(good.map((r) => tokenCost(r) * 1e6)) / 1e4).toFixed(3),
    meanTokenCostCents: (good.reduce((a, r) => a + tokenCost(r), 0) / good.length * 100).toFixed(3),
    kindOk: `${good.filter((r) => r.kindOk).length}/${good.length}`,
    orgOk: `${good.filter((r) => r.orgOk).length}/${good.length}`,
    wrong: good.filter((r) => !r.orgOk || !r.kindOk).map((r) => `${r.model} ${r.case}: ${r.kind} / ${r.org} / ${r.department}`),
  });
}
ok.sort((a, b) => a.medianMs - b.medianMs);
console.log(JSON.stringify({ ok, failed }, null, 1));

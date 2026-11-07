import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.ts";
import type { AnalyzeResponse, Report } from "./schema.ts";

// Demo persistence: one JSON file. Swap for a real database before production.
const reportsFile = path.join(config.dataDir, "reports.json");
let reports: Report[] = [];
let writeChain: Promise<void> = Promise.resolve();

/** Analyses awaiting user confirmation. In-memory: lost on restart, which just means "analyze again". */
const pending = new Map<string, AnalyzeResponse>();
const MAX_PENDING = 200;

export async function initStore(): Promise<void> {
  await mkdir(config.uploadsDir, { recursive: true });
  try {
    reports = JSON.parse(await readFile(reportsFile, "utf8")) as Report[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    reports = [];
  }
}

function persist(): Promise<void> {
  const snapshot = JSON.stringify(reports, null, 2);
  writeChain = writeChain.then(async () => {
    const tmp = `${reportsFile}.tmp`;
    await writeFile(tmp, snapshot);
    await rename(tmp, reportsFile);
  });
  return writeChain;
}

export function listReports(): Report[] {
  return reports.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getReport(id: string): Report | undefined {
  return reports.find((r) => r.id === id);
}

export async function addReport(report: Report): Promise<void> {
  reports.push(report);
  await persist();
}

export function savePending(result: AnalyzeResponse): void {
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next().value;
    if (oldest) pending.delete(oldest);
  }
  pending.set(result.analysisId, result);
}

export function getPending(id: string): AnalyzeResponse | undefined {
  return pending.get(id);
}

export function deletePending(id: string): void {
  pending.delete(id);
}

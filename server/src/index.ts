import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { config, HttpError } from "./config.ts";
import { analyzeIssue, getClient } from "./gemini.ts";
import { reverseGeocode } from "./geocode.ts";
import {
  createReportSchema,
  type AnalyzeResponse,
  type HealthResponse,
  type Report,
} from "./schema.ts";
import { addReport, deletePending, getPending, getReport, initStore, listReports, savePending } from "./store.ts";

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const analyzeFields = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  note: z.string().max(1000).default(""),
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  const body: HealthResponse = { ok: true, geminiConfigured: Boolean(config.geminiApiKey), model: config.geminiModel };
  res.json(body);
});

app.post("/api/analyze", upload.single("photo"), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, "Missing 'photo' file");
  const ext = IMAGE_TYPES[file.mimetype];
  if (!ext) throw new HttpError(415, `Unsupported image type '${file.mimetype}'. Use JPEG, PNG, or WebP.`);
  const { lat, lng, note } = analyzeFields.parse(req.body);
  getClient(); // fail fast with 503 before spending a geocoding request

  const place = await reverseGeocode(lat, lng);
  const gemini = await analyzeIssue({ image: file.buffer, mimeType: file.mimetype, place, note });

  const analysisId = randomUUID();
  const fileName = `${analysisId}.${ext}`;
  await writeFile(path.join(config.uploadsDir, fileName), file.buffer);

  const result: AnalyzeResponse = { analysisId, photoUrl: `/uploads/${fileName}`, place, ...gemini };
  savePending(result);
  res.json(result);
});

app.post("/api/reports", async (req, res) => {
  const body = createReportSchema.parse(req.body);
  const pending = getPending(body.analysisId);
  if (!pending) throw new HttpError(404, "Analysis not found or expired. Please analyze the photo again.");
  if (!pending.analysis.isInfrastructureIssue) throw new HttpError(400, "This photo was not recognized as an infrastructure issue.");

  const report: Report = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "submitted",
    photoUrl: pending.photoUrl,
    locationSource: body.locationSource,
    note: body.note,
    place: pending.place,
    analysis: { ...pending.analysis, ...body.edits },
    sources: pending.sources,
    model: pending.model,
  };
  await addReport(report);
  deletePending(body.analysisId);
  res.status(201).json(report);
});

app.get("/api/reports", (_req, res) => {
  res.json(listReports());
});

app.get("/api/reports/:id", (req, res) => {
  const report = getReport(req.params.id);
  if (!report) throw new HttpError(404, "Report not found");
  res.json(report);
});

app.use("/api", () => {
  throw new HttpError(404, "Not found");
});

app.use("/uploads", express.static(config.uploadsDir, { maxAge: "1d", fallthrough: false }));

// Production: serve the built web app from the same origin.
if (existsSync(config.webDist)) {
  app.use(express.static(config.webDist));
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(config.webDist, "index.html"));
  });
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else if (err instanceof z.ZodError) {
    res.status(400).json({ error: "Invalid request", issues: err.issues });
  } else if (err instanceof multer.MulterError) {
    res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.message });
  } else if (typeof err?.status === "number" && err.status < 500) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
};
app.use(errorHandler);

await initStore();
app.listen(config.port, () => {
  console.log(`Infra API listening on http://localhost:${config.port}`);
  if (!config.geminiApiKey) console.warn("GEMINI_API_KEY is not set: /api/analyze will return 503.");
});

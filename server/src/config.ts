import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

export const config = {
  port: Number(process.env.PORT ?? 8787),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  nominatimUrl: process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org",
  nominatimContact: process.env.NOMINATIM_CONTACT ?? "",
  dataDir: path.join(root, "data"),
  uploadsDir: path.join(root, "data", "uploads"),
  webDist: path.resolve(root, "..", "web", "dist"),
};

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

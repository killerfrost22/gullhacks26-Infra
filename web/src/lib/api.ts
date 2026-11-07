import type {
  AnalyzeResponse,
  CreateReportRequest,
  HealthResponse,
  Report,
} from "../../../server/src/schema.ts";

export type * from "../../../server/src/schema.ts";
export { CATEGORIES, SEVERITIES } from "../../../server/src/constants.ts";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("Couldn't reach the server. Is the API running?");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (HTTP ${res.status})`);
  return body as T;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),

  analyze: (photo: Blob, lat: number, lng: number, note: string) => {
    const form = new FormData();
    form.append("photo", photo, "photo.jpg");
    form.append("lat", String(lat));
    form.append("lng", String(lng));
    form.append("note", note);
    return request<AnalyzeResponse>("/api/analyze", { method: "POST", body: form });
  },

  createReport: (body: CreateReportRequest) =>
    request<Report>("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  listReports: () => request<Report[]>("/api/reports"),

  getReport: (id: string) => request<Report>(`/api/reports/${encodeURIComponent(id)}`),
};

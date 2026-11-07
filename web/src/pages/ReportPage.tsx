import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { CategoryBadge, SeverityBadge } from "../components/Badges.tsx";
import { LocationPicker, type LatLng } from "../components/LocationPicker.tsx";
import { ResponsiblePartyCard, SourcesList } from "../components/ResponsibleParty.tsx";
import {
  api,
  CATEGORIES,
  SEVERITIES,
  type AnalyzeResponse,
  type Category,
  type LocationSource,
  type Severity,
} from "../lib/api.ts";
import { CATEGORY_LABELS, LOCATION_SOURCE_LABELS, SEVERITY_LABELS } from "../lib/labels.ts";
import { getDevicePosition, preparePhoto, type PreparedPhoto } from "../lib/photo.ts";

const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
const input =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

interface Edits {
  title: string;
  description: string;
  category: Category;
  severity: Severity;
  subject: string;
  body: string;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className={card}>
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-teal-700 text-xs text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

export function ReportPage() {
  const navigate = useNavigate();
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  const [geminiReady, setGeminiReady] = useState<boolean | null>(null);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource | null>(null);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [edits, setEdits] = useState<Edits | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(
      (h) => setGeminiReady(h.geminiConfigured),
      () => setGeminiReady(false),
    );
  }, []);

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.previewUrl)), [photo]);

  const clearResult = () => {
    setResult(null);
    setEdits(null);
  };

  const onPick = useCallback((p: LatLng) => {
    setLocation(p);
    setLocationSource("map");
    setResult(null);
    setEdits(null);
  }, []);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setPhotoBusy(true);
    clearResult();
    try {
      const prepared = await preparePhoto(file);
      setPhoto(prepared);
      if (prepared.gps) {
        setLocation(prepared.gps);
        setLocationSource("photo");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function useMyLocation() {
    setError(null);
    setLocating(true);
    try {
      const pos = await getDevicePosition();
      setLocation({ lat: pos.lat, lng: pos.lng });
      setLocationSource("device");
      clearResult();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLocating(false);
    }
  }

  async function analyze() {
    if (!photo || !location) return;
    setError(null);
    setAnalyzing(true);
    clearResult();
    try {
      const res = await api.analyze(photo.blob, location.lat, location.lng, note.trim());
      setResult(res);
      const a = res.analysis;
      setEdits({
        title: a.title,
        description: a.description,
        category: a.category,
        severity: a.severity,
        subject: a.reportDraft.subject,
        body: a.reportDraft.body,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!result || !edits || !locationSource) return;
    setError(null);
    setSubmitting(true);
    try {
      const report = await api.createReport({
        analysisId: result.analysisId,
        locationSource,
        note: note.trim(),
        edits: {
          title: edits.title,
          description: edits.description,
          category: edits.category,
          severity: edits.severity,
          reportDraft: { subject: edits.subject, body: edits.body },
        },
      });
      navigate(`/reports/${report.id}`, { state: { justSubmitted: true } });
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const setEdit = <K extends keyof Edits>(key: K, value: Edits[K]) => setEdits((prev) => prev && { ...prev, [key]: value });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Report broken public infrastructure</h1>
        <p className="mt-1 text-slate-600">
          Snap a photo. Gemini identifies the problem and figures out who is responsible for fixing it at that location.
        </p>
      </div>

      {geminiReady === false && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          The API is not reachable or <code>GEMINI_API_KEY</code> is not set on the server. Analysis will fail until{" "}
          <code>server/.env</code> is configured.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Step n={1} title="Photo of the problem">
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
            <input ref={libraryInput} type="file" accept="image/*" hidden onChange={onFile} data-testid="photo-input" />
            {photo ? (
              <img src={photo.previewUrl} alt="Selected issue" className="mb-3 max-h-80 w-full rounded-lg object-contain bg-slate-100" />
            ) : (
              <div className="mb-3 grid h-40 place-items-center rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-500">
                {photoBusy ? "Processing photo…" : "No photo yet"}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primaryBtn} onClick={() => cameraInput.current?.click()} disabled={photoBusy}>
                📷 Take photo
              </button>
              <button type="button" className={secondaryBtn} onClick={() => libraryInput.current?.click()} disabled={photoBusy}>
                🖼 Choose from library
              </button>
            </div>
            {photo && !photo.gps && (
              <p className="mt-2 text-xs text-slate-500">This photo has no GPS data — set the location in step 2.</p>
            )}
          </Step>

          <Step n={2} title="Where is it?">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button type="button" className={secondaryBtn} onClick={useMyLocation} disabled={locating}>
                📍 {locating ? "Locating…" : "Use my location"}
              </button>
              {locationSource && location && (
                <span className="text-xs text-slate-600">
                  {LOCATION_SOURCE_LABELS[locationSource]} · {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </span>
              )}
            </div>
            <LocationPicker value={location} onPick={onPick} />
            <p className="mt-2 text-xs text-slate-500">Tap the map to drop a pin, or drag the pin to adjust.</p>
          </Step>

          <Step n={3} title="Anything to add? (optional)">
            <textarea
              className={input}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Car-sized pothole in the right lane, been here 2 weeks"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Step>

          <button
            type="button"
            className={`${primaryBtn} w-full py-3 text-base`}
            onClick={analyze}
            disabled={!photo || !location || analyzing}
          >
            {analyzing ? (
              <>
                <Spinner /> Analyzing photo & finding responsible party…
              </>
            ) : (
              "✨ Analyze with Gemini"
            )}
          </button>
          {(!photo || !location) && (
            <p className="text-center text-xs text-slate-500">Add a photo and a location to analyze.</p>
          )}
        </div>

        <div className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {!result && !analyzing && (
            <div className={`${card} text-sm text-slate-500`}>
              The analysis will appear here: what's broken, how severe it is, which agency maintains it, and a ready-to-send
              report.
            </div>
          )}

          {analyzing && (
            <div className={`${card} animate-pulse space-y-3`} aria-live="polite">
              <p className="text-sm text-slate-600">Looking up the address, inspecting the photo, and searching for the maintaining agency…</p>
              <div className="h-4 w-2/3 rounded bg-slate-200" />
              <div className="h-4 w-1/2 rounded bg-slate-200" />
              <div className="h-24 rounded bg-slate-200" />
            </div>
          )}

          {result && !result.analysis.isInfrastructureIssue && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
              <p className="font-semibold">No infrastructure issue detected.</p>
              <p className="mt-1">{result.analysis.description}</p>
              <p className="mt-2">Try a closer photo of the damaged asset.</p>
            </div>
          )}

          {result && edits && result.analysis.isInfrastructureIssue && (
            <form onSubmit={submit} className="space-y-4" aria-live="polite">
              <section className={card}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <CategoryBadge category={edits.category} />
                  <SeverityBadge severity={edits.severity} />
                  <span className="text-xs text-slate-500">
                    {Math.round(result.analysis.confidence * 100)}% confident
                  </span>
                </div>
                {edits.severity === "hazard" && (
                  <p className="mb-3 rounded-md bg-red-50 p-2 text-sm font-medium text-red-800">
                    If there is immediate danger to people or vehicles, call 911.
                  </p>
                )}
                <p className="mb-3 text-sm text-slate-600">📍 {result.place.displayName}</p>
                <div className="space-y-3">
                  <label className="block text-sm font-medium">
                    Title
                    <input className={`${input} mt-1`} value={edits.title} onChange={(e) => setEdit("title", e.target.value)} required maxLength={200} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium">
                      Category
                      <select className={`${input} mt-1`} value={edits.category} onChange={(e) => setEdit("category", e.target.value as Category)}>
                        {CATEGORIES.filter((c) => c !== "none").map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABELS[c]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      Severity
                      <select className={`${input} mt-1`} value={edits.severity} onChange={(e) => setEdit("severity", e.target.value as Severity)}>
                        {SEVERITIES.map((s) => (
                          <option key={s} value={s}>
                            {SEVERITY_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">Why this severity: {result.analysis.severityReason}</p>
                  <label className="block text-sm font-medium">
                    Description
                    <textarea className={`${input} mt-1`} rows={3} value={edits.description} onChange={(e) => setEdit("description", e.target.value)} required maxLength={2000} />
                  </label>
                  {result.analysis.hazards.length > 0 && (
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">Risks:</span> {result.analysis.hazards.join(", ")}
                    </p>
                  )}
                </div>
              </section>

              <ResponsiblePartyCard party={result.analysis.responsibleParty} alternates={result.analysis.alternateParties} />

              <section className={card}>
                <h3 className="mb-2 text-sm font-semibold">Report to send</h3>
                <label className="block text-sm font-medium">
                  Subject
                  <input className={`${input} mt-1`} value={edits.subject} onChange={(e) => setEdit("subject", e.target.value)} maxLength={300} />
                </label>
                <label className="mt-3 block text-sm font-medium">
                  Message
                  <textarea className={`${input} mt-1 font-mono text-xs`} rows={10} value={edits.body} onChange={(e) => setEdit("body", e.target.value)} maxLength={5000} />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={secondaryBtn} onClick={() => navigator.clipboard.writeText(`${edits.subject}\n\n${edits.body}`)}>
                    Copy message
                  </button>
                  {result.analysis.responsibleParty.email && (
                    <a
                      className={secondaryBtn}
                      href={`mailto:${result.analysis.responsibleParty.email}?subject=${encodeURIComponent(edits.subject)}&body=${encodeURIComponent(edits.body)}`}
                    >
                      Open in email
                    </a>
                  )}
                </div>
              </section>

              <SourcesList sources={result.sources} queries={result.searchQueries} />

              <button type="submit" className={`${primaryBtn} w-full py-3 text-base`} disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner /> Submitting…
                  </>
                ) : (
                  "Submit report"
                )}
              </button>
              <p className="text-center text-xs text-slate-500">
                Submitted reports appear on the <Link to="/map" className="underline">public map</Link>. Analysis by {result.model}.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

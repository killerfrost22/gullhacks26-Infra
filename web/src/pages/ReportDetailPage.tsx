import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import { Link, useLocation, useParams } from "react-router";
import { CategoryBadge, SeverityBadge } from "../components/Badges.tsx";
import { ResponsiblePartyCard, SourcesList } from "../components/ResponsibleParty.tsx";
import { api, type Report } from "../lib/api.ts";
import { LOCATION_SOURCE_LABELS, SEVERITY_STYLES } from "../lib/labels.ts";
import { OSM_ATTRIBUTION, OSM_TILES } from "../lib/leaflet.ts";

export function ReportDetailPage() {
  const { id = "" } = useParams();
  const justSubmitted = (useLocation().state as { justSubmitted?: boolean } | null)?.justSubmitted;
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getReport(id).then(setReport, (err: Error) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-lg font-semibold">{error}</p>
        <Link to="/map" className="text-teal-700 underline">Back to map</Link>
      </div>
    );
  }
  if (!report) return <p className="text-slate-500">Loading…</p>;

  const { analysis, place } = report;
  return (
    <div className="space-y-6">
      {justSubmitted && (
        <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          ✅ Report submitted. Reference ID: <code className="font-mono">{report.id.slice(0, 8).toUpperCase()}</code>
        </div>
      )}

      <div>
        <div className="mb-2 flex flex-wrap gap-2">
          <CategoryBadge category={analysis.category} />
          <SeverityBadge severity={analysis.severity} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{analysis.title}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Reported {new Date(report.createdAt).toLocaleString()} · {LOCATION_SOURCE_LABELS[report.locationSource]}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <img src={report.photoUrl} alt={analysis.title} className="w-full rounded-xl border border-slate-200 bg-slate-100 object-contain" />
          <MapContainer center={[place.lat, place.lng]} zoom={17} className="h-56 w-full rounded-xl border border-slate-300">
            <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
            <CircleMarker
              center={[place.lat, place.lng]}
              radius={10}
              pathOptions={{ color: "#fff", weight: 2, fillColor: SEVERITY_STYLES[analysis.severity].color, fillOpacity: 0.9 }}
            />
          </MapContainer>
          <p className="text-sm text-slate-600">📍 {place.displayName}</p>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-800">{analysis.description}</p>
            {analysis.hazards.length > 0 && (
              <p className="mt-2 text-sm"><span className="font-medium">Risks:</span> {analysis.hazards.join(", ")}</p>
            )}
            {report.note && <p className="mt-2 text-sm text-slate-600"><span className="font-medium">Reporter note:</span> {report.note}</p>}
          </section>

          <ResponsiblePartyCard party={analysis.responsibleParty} alternates={analysis.alternateParties} />

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{analysis.reportDraft.subject}</h2>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-700">{analysis.reportDraft.body}</pre>
          </section>

          <SourcesList sources={report.sources} />
          <p className="text-xs text-slate-500">Analysis by {report.model}</p>
        </div>
      </div>
    </div>
  );
}

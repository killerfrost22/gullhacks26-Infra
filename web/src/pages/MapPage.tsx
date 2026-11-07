import { useEffect, useState } from "react";
import { latLngBounds } from "leaflet";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { Link } from "react-router";
import { CategoryBadge, SeverityBadge } from "../components/Badges.tsx";
import { api, type Report } from "../lib/api.ts";
import { DEFAULT_CENTER, OSM_ATTRIBUTION, OSM_TILES } from "../lib/leaflet.ts";
import { SEVERITY_STYLES } from "../lib/labels.ts";

function FitToReports({ reports }: { reports: Report[] }) {
  const map = useMap();
  useEffect(() => {
    if (reports.length === 0) return;
    const bounds = latLngBounds(reports.map((r) => [r.place.lat, r.place.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [map, reports]);
  return null;
}

export function MapPage() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listReports().then(setReports, (err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reported issues</h1>
          <p className="text-sm text-slate-600">
            {reports ? `${reports.length} report${reports.length === 1 ? "" : "s"}` : "Loading…"} · marker color = severity
          </p>
        </div>
        <Link to="/" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
          + New report
        </Link>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <MapContainer center={DEFAULT_CENTER} zoom={13} className="h-[60vh] w-full rounded-xl border border-slate-300">
          <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
          {reports && <FitToReports reports={reports} />}
          {reports?.map((r) => (
            <CircleMarker
              key={r.id}
              center={[r.place.lat, r.place.lng]}
              radius={10}
              pathOptions={{ color: "#fff", weight: 2, fillColor: SEVERITY_STYLES[r.analysis.severity].color, fillOpacity: 0.9 }}
            >
              <Popup>
                <div className="w-52 space-y-1">
                  <img src={r.photoUrl} alt={r.analysis.title} className="h-28 w-full rounded object-cover" />
                  <p className="font-semibold">{r.analysis.title}</p>
                  <p className="text-xs text-slate-600">→ {r.analysis.responsibleParty.name}</p>
                  <Link to={`/reports/${r.id}`} className="text-xs font-medium text-teal-700 underline">
                    View details
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {reports?.length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No reports yet. <Link to="/" className="underline">Submit the first one.</Link>
            </li>
          )}
          {reports?.map((r) => (
            <li key={r.id}>
              <Link to={`/reports/${r.id}`} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-2 hover:border-teal-400">
                <img src={r.photoUrl} alt="" className="size-16 shrink-0 rounded object-cover" />
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold">{r.analysis.title}</p>
                  <div className="flex flex-wrap gap-1">
                    <CategoryBadge category={r.analysis.category} />
                    <SeverityBadge severity={r.analysis.severity} />
                  </div>
                  <p className="truncate text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

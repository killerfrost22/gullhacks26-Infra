import { useEffect, useMemo, useRef } from "react";
import type { Marker as LeafletMarker } from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { DEFAULT_CENTER, OSM_ATTRIBUTION, OSM_TILES } from "../lib/leaflet.ts";

export interface LatLng {
  lat: number;
  lng: number;
}

function Recenter({ value }: { value: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], Math.max(map.getZoom(), 17));
  }, [map, value]);
  return null;
}

function ClickToPlace({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export function LocationPicker({ value, onPick }: { value: LatLng | null; onPick: (p: LatLng) => void }) {
  const markerRef = useRef<LeafletMarker>(null);
  const handlers = useMemo(
    () => ({
      dragend() {
        const pos = markerRef.current?.getLatLng();
        if (pos) onPick({ lat: pos.lat, lng: pos.lng });
      },
    }),
    [onPick],
  );

  return (
    <MapContainer
      center={value ? [value.lat, value.lng] : DEFAULT_CENTER}
      zoom={value ? 17 : 13}
      className="h-72 w-full rounded-lg border border-slate-300"
    >
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
      <ClickToPlace onPick={onPick} />
      <Recenter value={value} />
      {value && (
        <Marker
          position={[value.lat, value.lng]}
          draggable
          eventHandlers={handlers}
          ref={markerRef}
          title="Issue location (drag to adjust)"
        />
      )}
    </MapContainer>
  );
}

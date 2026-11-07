import type { Category, Severity } from "./api.ts";

export const CATEGORY_LABELS: Record<Category, string> = {
  pothole: "Pothole",
  streetlight: "Streetlight",
  sidewalk: "Sidewalk / curb",
  traffic_signal: "Traffic signal",
  sign: "Road sign",
  water: "Water leak / hydrant",
  drainage: "Storm drain / flooding",
  debris: "Fallen tree / debris",
  graffiti: "Graffiti / vandalism",
  other: "Other",
  none: "Not an infrastructure issue",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  hazard: "Hazard",
};

export const SEVERITY_STYLES: Record<Severity, { badge: string; color: string }> = {
  low: { badge: "bg-emerald-100 text-emerald-800 ring-emerald-600/20", color: "#059669" },
  medium: { badge: "bg-amber-100 text-amber-800 ring-amber-600/20", color: "#d97706" },
  high: { badge: "bg-orange-100 text-orange-800 ring-orange-600/20", color: "#ea580c" },
  hazard: { badge: "bg-red-100 text-red-800 ring-red-600/20", color: "#dc2626" },
};

export const LOCATION_SOURCE_LABELS = {
  photo: "From photo GPS",
  device: "From your device",
  map: "Pinned on map",
} as const;

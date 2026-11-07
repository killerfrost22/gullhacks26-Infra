// Runtime enum values shared with the web app. Keep this file dependency-free so the browser bundle stays small.
export const CATEGORIES = [
  "pothole",
  "streetlight",
  "sidewalk",
  "traffic_signal",
  "sign",
  "water",
  "drainage",
  "debris",
  "graffiti",
  "other",
  "none",
] as const;

export const SEVERITIES = ["low", "medium", "high", "hazard"] as const;

export const JURISDICTION_LEVELS = [
  "city",
  "county",
  "state",
  "federal",
  "utility",
  "university",
  "private",
  "unknown",
] as const;

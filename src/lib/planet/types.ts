// Unified model for a natural-disaster / hazard event plotted on the globe.
// Both NASA EONET events and USGS earthquakes are normalized into this shape.

export type HazardCategory =
  | "wildfire"
  | "volcano"
  | "earthquake"
  | "severeStorm"
  | "flood"
  | "drought"
  | "seaLakeIce"
  | "landslide"
  | "snow"
  | "dustHaze"
  | "manmade"
  | "waterColor"
  | "tempExtreme"
  | "other";

export interface HazardEvent {
  /** Stable id, prefixed by source (e.g. "eonet:EONET_1234", "usgs:us7000..."). */
  id: string;
  title: string;
  category: HazardCategory;
  /** Longitude, latitude in degrees (WGS84). */
  lon: number;
  lat: number;
  /** ISO timestamp of the most recent observation. */
  date: string;
  /** 0..1 normalized severity used to size/animate the marker. */
  severity: number;
  /** Free-form magnitude label (e.g. "M5.4", "Cat 3", "active"). */
  magnitude?: string;
  /** Source system. */
  source: "EONET" | "USGS";
  /** Canonical link for more detail. */
  link?: string;
}

export interface HazardFeed {
  events: HazardEvent[];
  /** ISO time the feed was assembled. */
  updatedAt: string;
  /** Which upstream sources actually responded. */
  sources: string[];
  /** True when live upstreams failed and bundled sample data is served. */
  degraded: boolean;
  counts: Record<HazardCategory, number>;
}

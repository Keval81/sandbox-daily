/** One normalised event. Every layer, present and future, produces this shape. */
export interface LayerEvent {
  id: string;          // "eonet:EONET_6789" | "usgs:us7000t3g4"
  layer: string;       // "hazards"
  category: string;    // key into that layer's categories map
  title: string;
  lat: number;
  lon: number;
  date: string;        // ISO 8601
  severity: number;    // 0..1
  magnitude?: string;  // display only: "5.3 M", "35 kts"
  source: string;      // "EONET" | "USGS"
  url?: string;        // authoritative source page
}

/** What the renderer is allowed to know. No hazard concepts cross this line. */
export interface Marker {
  id: string;
  lat: number;
  lon: number;
  color: string;
  weight: number;      // 0..1 — drives spike height and dot radius
}

export interface CategoryMeta {
  label: string;
  color: string;
  weight: number;
}

export interface LayerIndex {
  score: number;       // 0..100
  band: string;
  color: string;
}

export interface LayerFetchResult {
  events: LayerEvent[];
  /** Events dropped because their geometry was unusable. Surfaced, never silent. */
  unplottable: number;
}

export interface LayerSource {
  id: string;
  label: string;
  categories: Record<string, CategoryMeta>;
  fetch(): Promise<LayerFetchResult>;
  index?(events: LayerEvent[]): LayerIndex;
}

export interface PulseLayerSummary {
  id: string;
  label: string;
  categories: Record<string, CategoryMeta>;
  /** false when this layer's fetch rejected — the HUD says which sources are live. */
  live: boolean;
  index: LayerIndex | null;
}

export interface PulseSnapshot {
  generatedAt: string;   // ISO 8601 — the real time this data was fetched
  stale: boolean;        // true = served from last-good cache; HUD must say "Snapshot"
  events: LayerEvent[];
  unplottable: number;
  layers: PulseLayerSummary[];
}

/** One normalised event. Every layer, present and future, produces this shape. */
export interface LayerEvent {
  id: string;          // "eonet:EONET_6789" | "usgs:us7000t3g4" | "gdacs:1029628"
  layer: string;       // "hazards"
  category: string;    // key into that layer's categories map
  title: string;
  lat: number;
  lon: number;
  date: string;        // ISO 8601
  severity: number;    // 0..1
  /**
   * Where `severity` came from. "magnitude" means it was derived from a
   * measurement of this event. "category" means it is the category's baseline
   * weight — identical for every event in that category, and therefore not a
   * reading of anything. The UI must not print a baseline as if it were one.
   */
  severityFrom?: "magnitude" | "category";
  magnitude?: string;  // display only: "5.3 M", "35 kts"
  source: string;      // "EONET" | "USGS" | "GDACS"
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

/** What a normaliser produces: the events it could plot, and the count it could not. */
export interface NormalisedEvents {
  events: LayerEvent[];
  /** Events dropped because their geometry was unusable. Surfaced, never silent. */
  unplottable: number;
}

/**
 * One upstream feed's outcome for this round. A layer that wraps several feeds
 * in allSettled never rejects, so promise state cannot tell anyone whether the
 * data is real — liveness has to travel with the data instead.
 */
export interface SourceStatus {
  id: string;          // "eonet" | "usgs"
  label: string;       // "EONET" — what the HUD names when it is down
  live: boolean;
}

export interface LayerFetchResult extends NormalisedEvents {
  /** One record per feed the layer consulted. Empty means the layer told us nothing. */
  sources: SourceStatus[];
}

export interface LayerSource {
  id: string;
  label: string;
  categories: Record<string, CategoryMeta>;
  /**
   * Display order for this layer's own category keys. It lives on the layer
   * because category keys are only unique within a layer — a generic panel that
   * imported one layer's ordering would render every other layer as empty.
   */
  categoryOrder: string[];
  fetch(): Promise<LayerFetchResult>;
  index?(events: LayerEvent[]): LayerIndex;
}

export interface PulseLayerSummary {
  id: string;
  label: string;
  categories: Record<string, CategoryMeta>;
  categoryOrder: string[];
  /** Per-feed liveness, so the HUD names the dead feed rather than the whole layer. */
  sources: SourceStatus[];
  /**
   * true when at least one of this layer's feeds answered this round. Derived
   * from `sources`, never from promise state: a layer that catches its own feed
   * failures always settles fulfilled, so promise state would read "live" over a
   * total outage.
   */
  live: boolean;
  index: LayerIndex | null;
}

export interface PulseSnapshot {
  /**
   * ISO 8601 — when this snapshot was ASSEMBLED, which is not when the data was
   * fetched. Upstream responses are cached for REVALIDATE_SECONDS, so the events
   * behind this stamp can be that much older. The UI says "as of" and names the
   * refresh window rather than implying this instant.
   */
  generatedAt: string;
  stale: boolean;        // true = served from last-good cache; HUD must say "Snapshot"
  events: LayerEvent[];
  unplottable: number;
  layers: PulseLayerSummary[];
}

import type { PulseLayerSummary, PulseSnapshot } from "./types";

/**
 * How long a fetched payload is reused. Kept here rather than inside a layer so
 * nothing generic has to import a specific layer to know it. `/pulse` repeats
 * the number as a literal because Next only accepts a literal for its segment
 * `revalidate` — that one copy is annotated.
 */
export const REVALIDATE_SECONDS = 600;

/**
 * The feeds that failed this round, named individually. A layer that reported no
 * sources at all failed as a whole, so it is named by its own label instead.
 */
export const deadSourceLabels = (layers: PulseLayerSummary[]): string[] =>
  layers.flatMap((layer) => {
    if (layer.sources.length === 0) return layer.live ? [] : [layer.label];
    return layer.sources.filter((s) => !s.live).map((s) => s.label);
  });

/** True only when nothing answered. An empty registry is not an outage. */
export const everySourceDead = (layers: PulseLayerSummary[]): boolean =>
  layers.length > 0 && layers.every((l) => !l.live);

export interface Freshness {
  label: string;
  live: boolean;
}

/**
 * A snapshot assembled a second ago out of nothing is not "Live". Without this
 * term, a total outage with no warm cache renders a blinking green pip over an
 * empty planet — the exact failure this feature was rebuilt to prevent.
 */
export const freshnessOf = (snapshot: PulseSnapshot): Freshness =>
  snapshot.stale || everySourceDead(snapshot.layers)
    ? { label: "Snapshot", live: false }
    : { label: "Live", live: true };

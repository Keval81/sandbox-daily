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

/**
 * Past this age the page stops calling itself Live. There is no client-side
 * refetch — /pulse is prerendered ISR HTML — so a tab left open overnight would
 * otherwise blink a green "Live" pip over nine-hour-old data. Twice the
 * revalidate window is the first age that normal caching cannot explain.
 */
export const STALE_AFTER_MS = 2 * REVALIDATE_SECONDS * 1000;

export interface Freshness {
  label: string;
  live: boolean;
}

/**
 * A snapshot assembled a second ago out of nothing is not "Live", and neither is
 * one a reader has had open for hours. Without the first term a total outage
 * with no warm cache renders a blinking green pip over an empty planet — the
 * exact failure this feature was rebuilt to prevent.
 *
 * Hydration-safe: `now` is seeded from generatedAt, so the age is 0 on both the
 * server render and the first client render, and only the 60s tick can age it.
 */
export const freshnessOf = (snapshot: PulseSnapshot, now: number): Freshness => {
  const age = now - Date.parse(snapshot.generatedAt);
  const aged = Number.isFinite(age) && age > STALE_AFTER_MS;
  return snapshot.stale || everySourceDead(snapshot.layers) || aged
    ? { label: "Snapshot", live: false }
    : { label: "Live", live: true };
};

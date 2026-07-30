import type { LayerFetchResult, LayerSource, PulseSnapshot } from "./types";
import { PULSE_LAYERS } from "./layers/registry";
import { everySourceDead } from "./freshness";

export const buildSnapshot = (
  layers: LayerSource[],
  results: PromiseSettledResult<LayerFetchResult>[],
  nowIso: string
): PulseSnapshot => {
  const settled = results.map((r) => (r.status === "fulfilled" ? r.value : null));
  const unplottable = settled.reduce((sum, v) => sum + (v?.unplottable ?? 0), 0);

  return {
    generatedAt: nowIso,
    stale: false,
    // Concatenate, never merge. Dedupe compares category keys, which are only
    // unique within a layer — merging across layers would silently collapse two
    // unrelated events the moment a second layer reuses a category key. Each
    // layer already deduped its own sources before handing them over.
    events: settled
      .flatMap((v) => v?.events ?? [])
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    unplottable,
    layers: layers.map((layer, i) => {
      const value = settled[i];
      const events = value?.events ?? [];
      // A layer that catches its own feed failures always settles fulfilled, so
      // promise state says nothing about whether the data is real. Only the
      // per-source records do. No sources reported = the layer told us nothing.
      const sources = value?.sources ?? [];
      const live = sources.some((s) => s.live);
      return {
        id: layer.id,
        label: layer.label,
        categories: layer.categories,
        categoryOrder: layer.categoryOrder,
        sources,
        live,
        // hazardIndex scores an empty list 0, which bands as a green "Calm" — a
        // fabricated reading over a dead feed. A dead layer publishes no index.
        index: live && layer.index ? layer.index(events) : null,
      };
    }),
  };
};

/**
 * Last good payload, held in module memory. On Vercel this is per-instance and
 * dies with a cold start — deliberate. The rule it exists to serve is that the
 * UI never claims freshness it does not have, not that data is never lost.
 */
let lastGood: PulseSnapshot | null = null;

/** Test-only. Not called by application code. */
export const __resetPulseCache = (): void => {
  lastGood = null;
};

/** `layers` is a test seam, like __resetPulseCache — application code passes nothing. */
export const getPulseSnapshot = async (
  layers: LayerSource[] = PULSE_LAYERS
): Promise<PulseSnapshot> => {
  const results = await Promise.allSettled(layers.map((l) => l.fetch()));
  const snapshot = buildSnapshot(layers, results, new Date().toISOString());

  const dead = everySourceDead(snapshot.layers);
  if (dead && lastGood) {
    return { ...lastGood, stale: true };
  }

  if (!dead) lastGood = snapshot;
  return snapshot;
};

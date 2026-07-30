import type { LayerFetchResult, LayerSource, PulseSnapshot } from "./types";
import { PULSE_LAYERS } from "./layers/registry";
import { mergeLayers } from "./merge";

export const buildSnapshot = (
  layers: LayerSource[],
  results: PromiseSettledResult<LayerFetchResult>[],
  nowIso: string
): PulseSnapshot => {
  const groups = results.map((r) => (r.status === "fulfilled" ? r.value.events : []));
  const unplottable = results.reduce(
    (sum, r) => sum + (r.status === "fulfilled" ? r.value.unplottable : 0),
    0
  );

  return {
    generatedAt: nowIso,
    stale: false,
    events: mergeLayers(groups),
    unplottable,
    layers: layers.map((layer, i) => {
      const result = results[i];
      const events = result.status === "fulfilled" ? result.value.events : [];
      return {
        id: layer.id,
        label: layer.label,
        categories: layer.categories,
        live: result.status === "fulfilled",
        index: layer.index ? layer.index(events) : null,
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

export const getPulseSnapshot = async (): Promise<PulseSnapshot> => {
  const results = await Promise.allSettled(PULSE_LAYERS.map((l) => l.fetch()));
  const snapshot = buildSnapshot(PULSE_LAYERS, results, new Date().toISOString());

  const everySourceDead = snapshot.layers.every((l) => !l.live);
  if (everySourceDead && lastGood) {
    return { ...lastGood, stale: true };
  }

  if (!everySourceDead) lastGood = snapshot;
  return snapshot;
};

import type { LayerEvent, LayerIndex } from "./types";
import { clamp } from "./severity";

const DEFAULT_WEIGHT = 0.6;
const MAX_WEIGHT = 1.15;      // the heaviest category weight — normalises intensity to 0..1
const TOP_N = 10;             // the ten worst events set the intensity term
const BREADTH_SCALE = 14;     // events above 0.5 needed before breadth saturates
const SIGNIFICANT = 0.5;

/** Ported from the prototype (lines 235–245); band colours rebound to site tokens. */
export const scoreBand = (score: number): { band: string; color: string } => {
  if (score >= 75) return { band: "Severe", color: "#FF2D55" };
  if (score >= 50) return { band: "High", color: "#E75D31" };
  if (score >= 25) return { band: "Elevated", color: "#FFD60A" };
  return { band: "Calm", color: "#56A077" };
};

/**
 * Two terms: intensity (how bad the worst ten are) and breadth (how many
 * significant events there are at all), weighted 62/38. One catastrophic
 * wildfire should not read the same as a planet on fire everywhere.
 */
export const hazardIndex = (
  events: LayerEvent[],
  weights: Record<string, number>
): LayerIndex => {
  if (events.length === 0) return { score: 0, ...scoreBand(0) };

  const weighted = events
    .map((e) => clamp(e.severity, 0, 1) * (weights[e.category] ?? DEFAULT_WEIGHT))
    .sort((a, b) => b - a);

  const top = weighted.slice(0, TOP_N);
  const intensity = top.reduce((a, b) => a + b, 0) / top.length / MAX_WEIGHT;
  const significant = weighted.filter((x) => x > SIGNIFICANT).length;
  const breadth = 1 - Math.exp(-significant / BREADTH_SCALE);
  const score = Math.round(100 * clamp(0.62 * intensity + 0.38 * breadth, 0, 1));

  return { score, ...scoreBand(score) };
};

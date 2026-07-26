import type { HazardCategory, HazardEvent } from "./types";

// Relative contribution of each hazard type to the Global Hazard Index.
const CAT_WEIGHT: Record<HazardCategory, number> = {
  wildfire: 1.0,
  volcano: 1.05,
  earthquake: 1.15,
  severeStorm: 1.15,
  flood: 1.0,
  drought: 0.7,
  landslide: 0.85,
  seaLakeIce: 0.45,
  snow: 0.5,
  dustHaze: 0.55,
  manmade: 0.5,
  waterColor: 0.4,
  tempExtreme: 0.7,
  other: 0.6,
};

export type HazardBand = "Calm" | "Elevated" | "High" | "Severe";

export interface HazardIndex {
  score: number; // 0..100
  band: HazardBand;
  color: string;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function bandFor(score: number): { band: HazardBand; color: string } {
  if (score >= 75) return { band: "Severe", color: "#ff2d55" };
  if (score >= 50) return { band: "High", color: "#ff5a1f" };
  if (score >= 25) return { band: "Elevated", color: "#ffd60a" };
  return { band: "Calm", color: "#43e0a0" };
}

/**
 * A 0–100 snapshot of global hazard state (100 = most severe). It blends the
 * intensity of the worst active hazards with how many significant hazards are
 * active, and is bounded so it doesn't simply track raw event count.
 */
export function disasterScore(events: HazardEvent[]): HazardIndex {
  if (!events.length) return { score: 0, ...bandFor(0) };
  const weighted = events
    .map((e) => clamp01(e.severity) * (CAT_WEIGHT[e.category] ?? 0.6))
    .sort((a, b) => b - a);

  const top = weighted.slice(0, 10);
  const intensity = top.reduce((a, b) => a + b, 0) / top.length / 1.15; // ~0..1
  const sig = weighted.filter((w) => w > 0.5).length;
  const breadth = 1 - Math.exp(-sig / 14); // 0..1, saturating

  const score = Math.round(100 * clamp01(0.62 * intensity + 0.38 * breadth));
  return { score, ...bandFor(score) };
}

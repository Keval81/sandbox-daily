import { freshnessOf } from "./freshness";
import type { Marker, PulseSnapshot } from "./types";

export interface IndexChip { layerId: string; label: string; score: number; band: string; color: string }
export interface WhisperEntry { label: string; count: number }

export interface HeroStatus {
  mode: "live" | "snapshot";
  generatedAt: string;
  /** null = withheld. The hero never prints a number it doesn't trust. */
  totalEvents: number | null;
  indexChips: IndexChip[];
  whisper: WhisperEntry[];
  aside: string | null;
}

const WHISPER_MAX = 4;

/** 6-digit hex, deliberately: the engine appends an alpha pair to marker colours. */
const FALLBACK_COLOR = "#98989D";
const DIM_COLOR = "#98989D";
const DIM_WEIGHT = 0.6;

export const markersFromSnapshot = (snapshot: PulseSnapshot, dimmed: boolean): Marker[] => {
  const byLayer = new Map(snapshot.layers.map((l) => [l.id, l.categories]));
  const liveLayerIds = new Set(snapshot.layers.filter((l) => l.live).map((l) => l.id));
  // Full-colour mode must not paint a dead layer's events as live — the stat
  // line's totalEvents already excludes them (deriveHeroStatus above), and a
  // marker on the globe is itself a claim of liveness. Dimmed (stale-snapshot)
  // mode greys the *whole* snapshot instead, so it keeps every event as-is.
  const events = dimmed ? snapshot.events : snapshot.events.filter((e) => liveLayerIds.has(e.layer));
  return events.map((e) => ({
    id: e.id, lat: e.lat, lon: e.lon,
    color: dimmed ? DIM_COLOR : byLayer.get(e.layer)?.[e.category]?.color ?? FALLBACK_COLOR,
    weight: dimmed ? e.severity * DIM_WEIGHT : e.severity,
  }));
};

/**
 * Worst first. Bands come from each layer's own index model — the canonical
 * vocabulary is hazard-index.ts's `scoreBand` (Severe/High/Elevated/Calm).
 * This module stays layer-agnostic on purpose: a future layer's index must
 * reuse these exact band names for its aside weighting to slot in here
 * without a redesign.
 */
const BAND_ORDER = ["Severe", "High", "Elevated", "Calm"];

const ASIDES: Record<string, string[]> = {
  Calm: ["— a quiet day, mostly", "— the planet, behaving itself", "— all things considered, calm"],
  Elevated: ["— a restless day out there", "— the planet has notes today", "— some grumbling underfoot"],
  High: ["— a rough day in places", "— parts of the planet are having a day", "— not everywhere is having a good day"],
  Severe: ["— a hard day for the planet", "— the planet is shouting today", "— rough out there, genuinely"],
  none: ["— nothing to report. enjoy it", "— all quiet, genuinely", "— the planet took the day off"],
};

/** Deterministic (varies by day, stable within one): no Math.random — the
 *  server render and hydration must agree, and tests must too. */
const pickAside = (pool: string[], generatedAt: string): string => {
  const day = Math.floor(Date.parse(generatedAt) / 86_400_000);
  return pool[day % pool.length];
};

const asideFor = (chips: IndexChip[], totalEvents: number, generatedAt: string): string | null => {
  if (totalEvents === 0) return pickAside(ASIDES.none, generatedAt);
  const worst = BAND_ORDER.find((b) => chips.some((c) => c.band === b));
  if (!worst) return null;                       // no band → no aside, never invent
  return pickAside(ASIDES[worst], generatedAt);
};

/**
 * Everything the hero is allowed to say, derived once. Layer-agnostic by
 * construction: totals span every live layer, indexes stay per-layer (a single
 * combined planet score cannot honestly rank a viral video against a quake).
 */
export const deriveHeroStatus = (snapshot: PulseSnapshot, now: number): HeroStatus => {
  const { live } = freshnessOf(snapshot, now);
  if (!live) {
    return { mode: "snapshot", generatedAt: snapshot.generatedAt,
             totalEvents: null, indexChips: [], whisper: [], aside: null };
  }

  const liveLayers = snapshot.layers.filter((l) => l.live);
  const liveIds = new Set(liveLayers.map((l) => l.id));
  const events = snapshot.events.filter((e) => liveIds.has(e.layer));

  const indexChips: IndexChip[] = liveLayers.flatMap((l) =>
    l.index ? [{ layerId: l.id, label: l.label, ...l.index }] : []);

  const counts = new Map<string, number>();          // "layerId:category" → count
  for (const e of events) {
    const key = `${e.layer}:${e.category}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const labelFor = (key: string): string => {
    const [layerId, category] = key.split(":");
    return snapshot.layers.find((l) => l.id === layerId)?.categories[category]?.label ?? category;
  };
  const whisper: WhisperEntry[] = [...counts.entries()]
    .map(([key, count]) => ({ label: labelFor(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, WHISPER_MAX);

  return { mode: "live", generatedAt: snapshot.generatedAt,
           totalEvents: events.length, indexChips, whisper, aside: asideFor(indexChips, events.length, snapshot.generatedAt) };
};

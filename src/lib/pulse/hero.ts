import { freshnessOf } from "./freshness";
import type { PulseSnapshot } from "./types";

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
           totalEvents: events.length, indexChips, whisper, aside: null };
};

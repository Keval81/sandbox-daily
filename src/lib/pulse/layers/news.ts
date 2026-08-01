import type { CategoryMeta, LayerFetchResult, LayerSource } from "../types";
import type { EventsFile } from "@/lib/radar/events";
import { readRadarFeed } from "@/lib/radar/feed";
import { geocodeHeadline, LONDON } from "@/lib/radar/geocode";

/**
 * The event radar as a globe layer: every radar headline that names a place
 * this side of the gazetteer gets a newsprint-cream pin. First of the
 * "add more as SanSan thinks of them" layers — a new layer is a file like
 * this one plus a registry line, nothing else.
 */

/** Radar snapshots refresh with deploys, not continuously — a week is the
 *  window inside which "recent headlines" is still an honest label. Older
 *  than that, the source reports dead: the layer dims/hides through the same
 *  machinery as any dead feed, rather than presenting stale news as current. */
export const NEWS_FRESH_DAYS = 7;

const SOURCE = { id: "radar", label: "Radar" };

export const NEWS_CATEGORIES: Record<string, CategoryMeta> = {
  headline: { label: "Headline", color: "#F5EED8", weight: 0.9 },
};

/** Two stories about the same country land on the same centroid; nudge each
 *  later one onto a small deterministic ring so every pin stays hoverable.
 *  ~0.9° ≈ 100km at the equator — visually adjacent, never stacked. Scoped
 *  per fetch (not module state): a persistent map would keep counting across
 *  revalidations and walk the pins further out every cycle. */
const makeCollisionSpreader = () => {
  const seen = new Map<string, number>();
  return (lat: number, lon: number): { lat: number; lon: number } => {
    const key = `${lat},${lon}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n === 0) return { lat, lon };
    const angle = (n * 2.399963) % (2 * Math.PI); // golden angle — no clumping
    return { lat: lat + Math.sin(angle) * 0.9, lon: lon + Math.cos(angle) * 0.9 };
  };
};

export const createNewsLayer = (
  read: () => Promise<EventsFile> = readRadarFeed,
  nowMs: () => number = Date.now
): LayerSource => ({
  id: "news",
  label: "News radar",
  categories: NEWS_CATEGORIES,
  categoryOrder: ["headline"],

  async fetch(): Promise<LayerFetchResult> {
    let feed: EventsFile;
    try {
      feed = await read();
    } catch (err) {
      console.error("[pulse] radar feed unreadable", err);
      return { events: [], unplottable: 0, sources: [{ ...SOURCE, live: false }] };
    }

    const ageMs = nowMs() - Date.parse(feed.generated_at);
    const live = Number.isFinite(ageMs) && ageMs <= NEWS_FRESH_DAYS * 86_400_000;

    const spreadCollisions = makeCollisionSpreader();
    let unplottable = 0;
    const events = feed.events.flatMap((e) => {
      const hit =
        e.location === "london" ? LONDON : geocodeHeadline(`${e.title} ${e.summary}`);
      if (!hit) {
        // A headline naming no known place has nowhere honest to go on a
        // globe. Counted, never silently dropped — the same contract the
        // hazard normalisers follow for unusable geometry.
        unplottable += 1;
        return [];
      }
      const pos = spreadCollisions(hit.lat, hit.lon);
      return [
        {
          id: `radar:${e.id}`,
          layer: "news",
          category: "headline",
          title: e.title,
          lat: pos.lat,
          lon: pos.lon,
          date: e.latest_seen,
          severity: Math.max(0, Math.min(1, e.score)),
          // "category", per the types.ts contract: the radar score ranks
          // attention, it does not measure the event — the UI must never
          // print it as a severity reading.
          severityFrom: "category" as const,
          source: "Radar",
          url: e.sources[0],
        },
      ];
    });

    return { events, unplottable, sources: [{ ...SOURCE, live }] };
  },
});

export const newsLayer = createNewsLayer();

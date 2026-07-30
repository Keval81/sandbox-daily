import type { LayerEvent, NormalisedEvents } from "./types";
import { severityFromWeight } from "./severity";

/**
 * EONET v3 category ids are camelCase and plural; our canonical keys are
 * singular. This is an explicit table rather than de-pluralising strings,
 * because "seaLakeIce" and "dustHaze" have no plural to strip and a silent
 * mismatch would file real events under "other".
 */
export const EONET_CATEGORY_MAP: Record<string, string> = {
  wildfires: "wildfire",
  volcanoes: "volcano",
  earthquakes: "earthquake",
  severeStorms: "severeStorm",
  floods: "flood",
  drought: "drought",
  landslides: "landslide",
  seaLakeIce: "seaLakeIce",
  dustHaze: "dustHaze",
};

interface RawGeometry {
  date?: string;
  type?: string;
  coordinates?: unknown;
  magnitudeValue?: number;
  magnitudeUnit?: string;
}

interface RawEvent {
  id?: string;
  title?: string;
  link?: string;
  categories?: { id?: string }[];
  sources?: { url?: string }[];
  geometry?: RawGeometry[];
}

/** Mean of a polygon's outer ring, ignoring the repeated closing vertex. */
export const centroidOf = (ring: number[][]): [number, number] => {
  const pts = ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  const sum = pts.reduce<[number, number]>(
    (acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat],
    [0, 0]
  );
  return [sum[0] / pts.length, sum[1] / pts.length];
};

const pointFrom = (g: RawGeometry): [number, number] | null => {
  const c = g.coordinates;
  if (!Array.isArray(c)) return null;
  if (g.type === "Polygon") {
    const ring = c[0];
    if (!Array.isArray(ring) || ring.length === 0) return null;
    return centroidOf(ring as number[][]);
  }
  if (typeof c[0] !== "number" || typeof c[1] !== "number") return null;
  return [c[0], c[1]];
};

/** A track carries every observation. Take the latest, or storms plot days stale. */
const latestGeometry = (geometry: RawGeometry[]): RawGeometry | null => {
  const dated = geometry.filter((g) => typeof g.date === "string");
  if (dated.length === 0) return geometry[0] ?? null;
  return dated.reduce((a, b) =>
    Date.parse(b.date as string) > Date.parse(a.date as string) ? b : a
  );
};

export const normaliseEonet = (
  raw: unknown,
  categoryWeights: Record<string, number>
): NormalisedEvents => {
  const payload = raw as { events?: RawEvent[] } | null;
  const rawEvents = payload?.events;
  if (!Array.isArray(rawEvents)) return { events: [], unplottable: 0 };

  const events: LayerEvent[] = [];
  let unplottable = 0;

  for (const ev of rawEvents) {
    const geometry = Array.isArray(ev.geometry) ? ev.geometry : [];
    const latest = geometry.length > 0 ? latestGeometry(geometry) : null;
    const point = latest ? pointFrom(latest) : null;

    if (!ev.id || !latest || !point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      unplottable += 1;
      continue;
    }

    const rawCategory = ev.categories?.[0]?.id ?? "";
    const category = EONET_CATEGORY_MAP[rawCategory] ?? "other";
    const magnitude =
      typeof latest.magnitudeValue === "number" && latest.magnitudeUnit
        ? `${latest.magnitudeValue} ${latest.magnitudeUnit}`
        : undefined;

    events.push({
      id: `eonet:${ev.id}`,
      layer: "hazards",
      category,
      title: ev.title ?? "Untitled event",
      lon: point[0],
      lat: point[1],
      date: new Date(latest.date ?? Date.now()).toISOString(),
      severity: severityFromWeight(categoryWeights[category] ?? 0.6),
      magnitude,
      source: "EONET",
      url: ev.sources?.[0]?.url ?? ev.link,
    });
  }

  return { events, unplottable };
};

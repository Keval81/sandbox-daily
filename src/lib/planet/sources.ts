import type { HazardCategory, HazardEvent, HazardFeed } from "./types";
import { CATEGORY_ORDER, mapEonetCategory } from "./categories";
import { SAMPLE_EVENTS } from "./sample";

const EONET_URL =
  "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30";
// M2.5+ earthquakes over the past week — dense enough to feel alive, filtered
// enough to stay meaningful.
const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";

const REVALIDATE_SECONDS = 900; // 15 minutes
const FETCH_TIMEOUT_MS = 12_000;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      // Cache at the data layer so bursts of viewers share one upstream hit.
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---- EONET (wildfires + all other natural events) -------------------------

interface EonetGeometry {
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
  date?: string;
  type?: string;
  coordinates?: unknown;
}
interface EonetEvent {
  id: string;
  title: string;
  link?: string;
  categories?: Array<{ id: string; title: string }>;
  geometry?: EonetGeometry[];
  sources?: Array<{ id: string; url: string }>;
}

/** Reduce a geometry's coordinates (Point or Polygon) to a single lon/lat. */
function geometryToPoint(geo: EonetGeometry): [number, number] | null {
  const c = geo.coordinates;
  if (!Array.isArray(c)) return null;
  if (typeof c[0] === "number" && typeof c[1] === "number") {
    return [c[0] as number, c[1] as number];
  }
  // Polygon / MultiPolygon — average the outer ring for a rough centroid.
  const ring = (Array.isArray(c[0]) ? c[0] : c) as unknown;
  const pts = (Array.isArray(ring) ? ring : []).filter(
    (p): p is [number, number] =>
      Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number"
  );
  if (!pts.length) return null;
  const sum = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [sum[0] / pts.length, sum[1] / pts.length];
}

// Baseline severity per category when no numeric magnitude is available.
const BASE_SEVERITY: Partial<Record<HazardCategory, number>> = {
  wildfire: 0.62,
  volcano: 0.6,
  severeStorm: 0.7,
  flood: 0.55,
  drought: 0.5,
  landslide: 0.45,
  seaLakeIce: 0.35,
  dustHaze: 0.4,
};

function eonetSeverity(cat: HazardCategory, geo: EonetGeometry): number {
  const base = BASE_SEVERITY[cat] ?? 0.45;
  const mag = geo.magnitudeValue;
  if (typeof mag === "number" && Number.isFinite(mag) && mag > 0) {
    const unit = (geo.magnitudeUnit ?? "").toLowerCase();
    if (cat === "wildfire") {
      // Fire radiative power (MW). Very skewed — log-scale it.
      return clamp01(0.4 + Math.log10(mag + 1) / 3);
    }
    if (unit.includes("kts") || unit.includes("mph")) {
      // Storm wind speed.
      return clamp01(mag / 160);
    }
    return clamp01(base + 0.15);
  }
  return base;
}

export function normalizeEonet(data: unknown): HazardEvent[] {
  const events = (data as { events?: EonetEvent[] })?.events;
  if (!Array.isArray(events)) return [];
  const out: HazardEvent[] = [];
  for (const ev of events) {
    const geoms = ev.geometry;
    if (!Array.isArray(geoms) || geoms.length === 0) continue;
    // Most recent observation is last in EONET's array.
    const geo = geoms[geoms.length - 1];
    const point = geometryToPoint(geo);
    if (!point) continue;
    const [lon, lat] = point;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const catId = ev.categories?.[0]?.id;
    const catTitle = ev.categories?.[0]?.title;
    const category = mapEonetCategory(catId, catTitle);
    const mag = geo.magnitudeValue;
    out.push({
      id: `eonet:${ev.id}`,
      title: ev.title,
      category,
      lon,
      lat,
      date: geo.date ?? new Date().toISOString(),
      severity: eonetSeverity(category, geo),
      magnitude:
        typeof mag === "number" && mag > 0
          ? `${Math.round(mag)}${geo.magnitudeUnit ? " " + geo.magnitudeUnit : ""}`
          : "active",
      source: "EONET",
      link: ev.link ?? ev.sources?.[0]?.url,
    });
  }
  return out;
}

// ---- USGS earthquakes ------------------------------------------------------

interface UsgsFeature {
  id: string;
  properties?: { mag?: number; place?: string; time?: number; url?: string };
  geometry?: { coordinates?: number[] };
}

export function normalizeUsgs(data: unknown): HazardEvent[] {
  const feats = (data as { features?: UsgsFeature[] })?.features;
  if (!Array.isArray(feats)) return [];
  const out: HazardEvent[] = [];
  for (const f of feats) {
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [lon, lat] = coords;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const mag = f.properties?.mag ?? 0;
    out.push({
      id: `usgs:${f.id}`,
      title: f.properties?.place
        ? `M${mag.toFixed(1)} — ${f.properties.place}`
        : `M${mag.toFixed(1)} Earthquake`,
      category: "earthquake",
      lon,
      lat,
      date: f.properties?.time
        ? new Date(f.properties.time).toISOString()
        : new Date().toISOString(),
      // Magnitude 2.5..8 → 0..1.
      severity: clamp01((mag - 2.5) / 5.5),
      magnitude: `M${mag.toFixed(1)}`,
      source: "USGS",
      link: f.properties?.url,
    });
  }
  return out;
}

// ---- Aggregation -----------------------------------------------------------

function countByCategory(events: HazardEvent[]): Record<HazardCategory, number> {
  const counts = Object.fromEntries(
    CATEGORY_ORDER.map((c) => [c, 0])
  ) as Record<HazardCategory, number>;
  for (const e of events) counts[e.category] = (counts[e.category] ?? 0) + 1;
  return counts;
}

/**
 * Fetch and merge live hazard data from NASA EONET and USGS. If both upstreams
 * fail (offline / blocked), fall back to the bundled sample so the globe still
 * renders — flagged via `degraded` so the UI can say so.
 */
export async function getHazardFeed(): Promise<HazardFeed> {
  const [eonetRes, usgsRes] = await Promise.allSettled([
    fetchJson(EONET_URL),
    fetchJson(USGS_URL),
  ]);

  const sources: string[] = [];
  let events: HazardEvent[] = [];

  if (eonetRes.status === "fulfilled") {
    const e = normalizeEonet(eonetRes.value);
    if (e.length) sources.push("NASA EONET");
    events = events.concat(e);
  }
  if (usgsRes.status === "fulfilled") {
    const u = normalizeUsgs(usgsRes.value);
    if (u.length) sources.push("USGS");
    events = events.concat(u);
  }

  const degraded = events.length === 0;
  if (degraded) {
    events = SAMPLE_EVENTS;
    sources.push("Sample data");
  }

  // Newest first — the list and ticker read top-down.
  events.sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return {
    events,
    updatedAt: new Date().toISOString(),
    sources,
    degraded,
    counts: countByCategory(events),
  };
}

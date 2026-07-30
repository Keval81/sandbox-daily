import type { LayerEvent } from "./types";

export const DEDUPE_KM = 50;
export const DEDUPE_HOURS = 2;

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

export const distanceKm = (aLat: number, aLon: number, bLat: number, bLon: number): number => {
  const dLat = (bLat - aLat) * DEG;
  const dLon = (bLon - aLon) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** USGS wins a collapse: it is the authoritative record with a real magnitude. */
const preferred = (a: LayerEvent, b: LayerEvent): LayerEvent =>
  b.source === "USGS" && a.source !== "USGS" ? b : a;

const isDuplicate = (a: LayerEvent, b: LayerEvent): boolean => {
  if (a.category !== b.category) return false;
  const hours = Math.abs(Date.parse(a.date) - Date.parse(b.date)) / 3_600_000;
  if (hours > DEDUPE_HOURS) return false;
  return distanceKm(a.lat, a.lon, b.lat, b.lon) <= DEDUPE_KM;
};

/**
 * Flattens every layer's events into one list, collapsing cross-source
 * duplicates. Quadratic, deliberately: these feeds carry tens of events, not
 * thousands, and a spatial index would be unreadable ceremony at this size.
 */
export const mergeLayers = (groups: LayerEvent[][]): LayerEvent[] => {
  const kept: LayerEvent[] = [];

  for (const event of groups.flat()) {
    const clashAt = kept.findIndex((k) => isDuplicate(k, event));
    if (clashAt === -1) {
      kept.push(event);
      continue;
    }
    kept[clashAt] = preferred(kept[clashAt], event);
  }

  return kept.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
};

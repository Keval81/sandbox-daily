import { GAZETTEER_PLACES } from "@/lib/radar/geocode";
import { distanceKm } from "./merge";

/**
 * Reverse geography: coordinates -> a region of the world, and where possible
 * the nearest place a reader would recognise. Two jobs:
 *
 *  1. Event cards say WHERE. "Active fire front" over a spinning globe is not
 *     a location; "near Athens · Southern Europe" is.
 *  2. FIRMS slot allocation buckets its clusters by region, so one continent's
 *     fire season cannot take every pin on the globe (normalise-firms.ts).
 *
 * Boxes, not polygons: a newspaper caption needs "Southern Europe", not a
 * border-accurate answer, and a box table is readable and auditable in a way
 * a shapefile in the bundle would not be. First match wins, so ORDER IS
 * LOAD-BEARING — specific regions precede the broad ones they sit inside, and
 * the ocean basins come last as the only honest answer for open water.
 */

export interface Region {
  id: string;
  label: string;
}

interface Box {
  id: string;
  label: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

const box = (
  id: string, label: string,
  minLat: number, maxLat: number, minLon: number, maxLon: number
): Box => ({ id, label, minLat, maxLat, minLon, maxLon });

const BOXES: Box[] = [
  // Poles first: nothing below should claim them.
  box("arctic", "The Arctic", 78, 90, -180, 180),
  box("antarctic", "Antarctica", -90, -60, -180, 180),

  // Europe. British Isles before the mainland boxes that would swallow them.
  box("british-isles", "The British Isles", 49, 61, -11, 2),
  box("s-europe", "Southern Europe", 35, 47, -10, 30),
  box("w-europe", "Western Europe", 42, 54, -10, 8),
  box("c-europe", "Central Europe", 45, 56, 3, 30),
  box("e-europe", "Eastern Europe", 44, 72, 27, 60),
  box("n-europe", "Northern Europe", 54, 72, -25, 32),

  // Middle East before both Africa and Asia — it overlaps each.
  box("middle-east", "The Middle East", 12, 42, 34, 63),

  // Africa.
  box("n-africa", "North Africa", 15, 38, -18, 36),
  box("w-africa", "West Africa", 0, 20, -18, 16),
  box("e-africa", "East Africa", -12, 18, 22, 52),
  box("c-africa", "Central Africa", -10, 15, 8, 32),
  box("s-africa", "Southern Africa", -36, -10, 10, 52),

  // Asia. Siberia sits after East Asia and takes everything above it.
  box("c-asia", "Central Asia", 35, 56, 46, 85),
  box("s-asia", "South Asia", 5, 38, 60, 92),
  box("se-asia", "Southeast Asia", -11, 25, 92, 142),
  box("e-asia", "East Asia", 20, 50, 100, 146),
  box("siberia", "Siberia", 48, 78, 58, 180),

  // Australasia and the Pacific islands.
  box("australia", "Australia", -45, -10, 110, 155),
  box("nz", "New Zealand", -48, -33, 165, 180),
  box("oceania", "Oceania", -30, 25, 130, 180),

  // The Americas.
  box("greenland", "Greenland", 59, 84, -75, -10),
  box("n-america", "North America", 12, 75, -170, -50),
  box("c-america", "Central America", 7, 25, -95, -58),
  box("s-america", "South America", -57, 13, -82, -33),

  // Open water — the last honest answer, never a landmass by default.
  box("indian", "The Indian Ocean", -60, 30, 20, 120),
  box("pacific-w", "The Pacific", -60, 66, 120, 180),
  box("pacific-e", "The Pacific", -60, 66, -180, -70),
  box("atlantic", "The Atlantic", -60, 72, -70, 20),
];

export const REGION_IDS: string[] = BOXES.map((b) => b.id);

const UNKNOWN: Region = { id: "unknown", label: "Open water" };

export const regionOf = (lat: number, lon: number): Region => {
  const found = BOXES.find(
    (b) => lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon
  );
  return found ? { id: found.id, label: found.label } : UNKNOWN;
};

/**
 * How near a gazetteer entry must be before the card names it. 400km is about
 * the distance at which "near X" stops being a useful orientation and starts
 * being a claim — a fire 400km from Athens is still recognisably Greece, one
 * 1500km away is not "near" anything. Beyond it the region alone is stated,
 * which is always true.
 */
const NEAR_KM = 400;

export const describeLocation = (lat: number, lon: number): string => {
  const region = regionOf(lat, lon);
  let best: { place: string; km: number } | null = null;
  for (const p of GAZETTEER_PLACES) {
    const km = distanceKm(lat, lon, p.lat, p.lon);
    if (km <= NEAR_KM && (best === null || km < best.km)) best = { place: p.place, km };
  }
  return best ? `near ${best.place} · ${region.label}` : region.label;
};

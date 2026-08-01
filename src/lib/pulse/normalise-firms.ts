import type { NormalisedEvents } from "./types";

/**
 * NASA FIRMS — MODIS active-fire detections, global, keyless CSV, ~25k rows
 * per 24h. This is the layer's answer to "why are there no wildfires in
 * Europe": EONET's fires come from IRWIN, a US interagency system, so its
 * wildfire coverage is structurally US-only, and GDACS only alerts on major
 * fires (and goes down). FIRMS sees every fire the satellites see —
 * including every European blaze — at the cost of being raw pixels, so this
 * normaliser clusters detections into fire complexes before they become
 * events.
 *
 * Known caveat, accepted: persistent industrial gas flares (Persian Gulf,
 * Niger delta) satisfy any confidence threshold and read as small "fires".
 * The magnitude string is honest about what a cluster is — N satellite
 * hotspots, not a named incident.
 */

/** MODIS confidence is 0–100; below ~60 the false-alarm rate climbs fast. */
export const FIRMS_MIN_CONFIDENCE = 60;
/** A cell needs this many detections to be a fire complex — lone pixels are
 *  noise, flares, or single-field burns. */
export const FIRMS_MIN_POINTS = 3;
/** 1° grid (~110km at the equator) — coarse enough that one wildfire front
 *  is one pin, fine enough that Attica and the Peloponnese stay separate. */
const CELL_DEG = 1.0;
const DEFAULT_MAX_CLUSTERS = 100;

interface Detection {
  lat: number;
  lon: number;
  frp: number;
  stampMs: number;
}

const COLS = 13;

const parseRow = (line: string): Detection | null => {
  const parts = line.split(",");
  if (parts.length !== COLS) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  const confidence = Number(parts[8]);
  const frp = Number(parts[11]);
  const stampMs = Date.parse(`${parts[5]}T${parts[6].padStart(4, "0").replace(/(..)(..)/, "$1:$2")}:00Z`);
  if (![lat, lon, confidence, frp].every(Number.isFinite) || !Number.isFinite(stampMs)) return null;
  if (confidence < FIRMS_MIN_CONFIDENCE) return { lat: NaN, lon: NaN, frp: 0, stampMs: 0 };
  return { lat, lon, frp, stampMs };
};

export const normaliseFirms = (
  csvText: unknown,
  maxClusters = DEFAULT_MAX_CLUSTERS
): NormalisedEvents => {
  if (typeof csvText !== "string") return { events: [], unplottable: 0 };
  const lines = csvText.trim().split("\n");

  let unplottable = 0;
  const cells = new Map<string, Detection[]>();

  for (const line of lines.slice(1)) {
    if (line.trim() === "") continue;
    const d = parseRow(line);
    if (d === null) {
      // A row that doesn't parse is a data problem worth surfacing;
      // a row filtered by confidence is working as designed.
      unplottable += 1;
      continue;
    }
    if (Number.isNaN(d.lat)) continue; // low-confidence, filtered by design
    const key = `${Math.floor(d.lat / CELL_DEG)}:${Math.floor(d.lon / CELL_DEG)}`;
    const cell = cells.get(key);
    if (cell) cell.push(d);
    else cells.set(key, [d]);
  }

  const clusters = [...cells.entries()]
    .filter(([, points]) => points.length >= FIRMS_MIN_POINTS)
    .map(([key, points]) => {
      const totalFrp = points.reduce((s, p) => s + p.frp, 0);
      const weight = totalFrp || points.length; // FRP can be 0 across a cell
      const lat = points.reduce((s, p) => s + p.lat * (p.frp || 1), 0) / weight;
      const lon = points.reduce((s, p) => s + p.lon * (p.frp || 1), 0) / weight;
      const latest = Math.max(...points.map((p) => p.stampMs));
      return { key, points: points.length, totalFrp, lat, lon, latest };
    })
    .sort((a, b) => b.totalFrp - a.totalFrp)
    .slice(0, maxClusters);

  const events = clusters.map((c) => ({
    id: `firms:${c.key}`,
    layer: "hazards",
    category: "wildfire",
    title: "Active fire front",
    lat: c.lat,
    lon: c.lon,
    date: new Date(c.latest).toISOString(),
    // log10 of total fire radiative power: ~30 MW village burn ≈ 0.6,
    // ~1000+ MW complex ≈ 0.9+. Measured (FRP), hence severityFrom
    // "magnitude" — the UI may print it as a reading.
    severity: Math.min(1, Math.max(0.3, 0.33 + 0.19 * Math.log10(Math.max(1, c.totalFrp)))),
    severityFrom: "magnitude" as const,
    magnitude: `${c.points} hotspots · ${Math.round(c.totalFrp)} MW`,
    source: "FIRMS",
    url: "https://firms.modaps.eosdis.nasa.gov/map/",
  }));

  return { events, unplottable };
};

import type { NormalisedEvents } from "./types";
import { regionOf } from "./region";

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
/** ~930 cells qualify on a normal day. Every one is a real fire, but a globe
 *  carrying all of them is a smear, so a cap is unavoidable; 220 is what
 *  reads as busy-but-legible beside the quake and headline layers. */
const DEFAULT_MAX_CLUSTERS = 220;

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

interface Cluster {
  key: string;
  points: number;
  totalFrp: number;
  lat: number;
  lon: number;
  latest: number;
}

/**
 * Fills the cap by taking each region's strongest cluster in turn, then each
 * region's second, and so on. A straight global sort by fire power does not
 * work here: African savanna and Siberian taiga burn at an order of magnitude
 * more total FRP than a European summer, so on a measured day they took 71 of
 * 100 slots and Europe got 2 of its 57 real fire fronts. Round-robin keeps the
 * ranking honest WITHIN a region (strongest first, always) while guaranteeing
 * no continent can be crowded off the globe by another's fire season.
 *
 * Deterministic throughout — regions are ordered by their strongest cluster,
 * ties broken by id — because the server render and the client hydration have
 * to agree on which pins exist.
 */
const allocateByRegion = (clusters: Cluster[], cap: number): Cluster[] => {
  const buckets = new Map<string, Cluster[]>();
  for (const c of clusters) {
    const id = regionOf(c.lat, c.lon).id;
    const bucket = buckets.get(id);
    if (bucket) bucket.push(c);
    else buckets.set(id, [c]);
  }

  const ordered = [...buckets.entries()]
    .map(([id, list]) => ({ id, list: list.sort((a, b) => b.totalFrp - a.totalFrp) }))
    .sort((a, b) => b.list[0].totalFrp - a.list[0].totalFrp || a.id.localeCompare(b.id));

  const picked: Cluster[] = [];
  const deepest = Math.max(...ordered.map((o) => o.list.length), 0);
  for (let rank = 0; rank < deepest && picked.length < cap; rank++) {
    for (const { list } of ordered) {
      if (picked.length >= cap) break;
      if (list[rank]) picked.push(list[rank]);
    }
  }
  return picked.sort((a, b) => b.totalFrp - a.totalFrp);
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

  const qualifying = [...cells.entries()]
    .filter(([, points]) => points.length >= FIRMS_MIN_POINTS)
    .map(([key, points]) => {
      const totalFrp = points.reduce((s, p) => s + p.frp, 0);
      const weight = totalFrp || points.length; // FRP can be 0 across a cell
      const lat = points.reduce((s, p) => s + p.lat * (p.frp || 1), 0) / weight;
      const lon = points.reduce((s, p) => s + p.lon * (p.frp || 1), 0) / weight;
      const latest = Math.max(...points.map((p) => p.stampMs));
      return { key, points: points.length, totalFrp, lat, lon, latest };
    });

  const clusters = allocateByRegion(qualifying, maxClusters);

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

import type { LayerEvent, NormalisedEvents } from "./types";
import { severityFromMagnitude } from "./severity";

interface RawFeature {
  id?: string;
  properties?: { mag?: number; place?: string; time?: number; url?: string };
  geometry?: { coordinates?: unknown } | null;
}

export const normaliseUsgs = (raw: unknown): NormalisedEvents => {
  const payload = raw as { features?: RawFeature[] } | null;
  const features = payload?.features;
  if (!Array.isArray(features)) return { events: [], unplottable: 0 };

  const events: LayerEvent[] = [];
  let unplottable = 0;

  for (const f of features) {
    // GeoJSON order is [lon, lat, depth]. Reading it as [lat, lon] silently
    // plots every quake in the wrong hemisphere — hence the explicit indices.
    const c = f.geometry?.coordinates;
    const lon = Array.isArray(c) ? c[0] : undefined;
    const lat = Array.isArray(c) ? c[1] : undefined;

    if (!f.id || typeof lon !== "number" || typeof lat !== "number") {
      unplottable += 1;
      continue;
    }

    // A NaN or out-of-range epoch makes toISOString throw RangeError, which
    // escapes past the layer's allSettled and blanks the whole globe over one
    // bad record. Number.isFinite catches both NaN and out-of-range.
    const stamp = typeof f.properties?.time === "number" ? f.properties.time : Date.now();
    if (!Number.isFinite(new Date(stamp).getTime())) {
      unplottable += 1;
      continue;
    }

    const mag = f.properties?.mag;
    events.push({
      id: `usgs:${f.id}`,
      layer: "hazards",
      category: "earthquake",
      title: f.properties?.place ?? "Earthquake",
      lon,
      lat,
      date: new Date(stamp).toISOString(),
      severity: severityFromMagnitude(typeof mag === "number" ? mag : Number.NaN),
      // A real reading only when a magnitude was reported; without one,
      // severityFromMagnitude falls back to the feed's floor, which is a
      // constant like EONET's and must not be labelled as measured.
      severityFrom: typeof mag === "number" ? "magnitude" : "category",
      magnitude: typeof mag === "number" ? `${mag} M` : undefined,
      source: "USGS",
      url: f.properties?.url || undefined,
    });
  }

  return { events, unplottable };
};

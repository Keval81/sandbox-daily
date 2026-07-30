import type { LayerEvent, NormalisedEvents } from "./types";
import { severityFromAlertLevel, severityFromWeight } from "./severity";

/**
 * GDACS's eventtype is a fixed two-letter code, not a word to de-pluralise —
 * an explicit table, like EONET's, so an unmapped code files under "other"
 * instead of silently matching nothing.
 */
export const GDACS_CATEGORY_MAP: Record<string, string> = {
  EQ: "earthquake",
  TC: "severeStorm",
  FL: "flood",
  VO: "volcano",
  DR: "drought",
  WF: "wildfire",
};

interface RawSeverityData {
  severity?: number;
  severityunit?: string;
}

interface RawUrl {
  report?: string;
}

interface RawProperties {
  eventtype?: string;
  eventid?: number | string;
  name?: string;
  url?: RawUrl;
  // GDACS sends a JSON null for a missing alert level, not an absent key —
  // the trap fixture pins this. `string` alone would let TS believe a
  // `typeof` guard below is redundant when it is load-bearing.
  alertlevel?: string | null;
  iscurrent?: string;
  fromdate?: string;
  todate?: string;
  datemodified?: string;
  severitydata?: RawSeverityData;
}

interface RawFeature {
  geometry?: { coordinates?: unknown } | null;
  properties?: RawProperties;
}

/**
 * GDACS's date fields ("2026-07-30T19:20:14") carry no "Z" or offset. Per the
 * ES Date Time String Format, a date-time with no offset parses as the
 * *host's local time*, not UTC — on a non-UTC machine (this repo's own dev
 * box included: Europe/London) that silently shifts every event by the
 * server's offset. GDACS's own values are UTC, so force it explicitly rather
 * than trust the ambient timezone.
 */
const UTC_SUFFIX = /([Zz]|[+-]\d{2}:\d{2})$/;
const asUtc = (raw: string): string => (UTC_SUFFIX.test(raw) ? raw : `${raw}Z`);

/**
 * `todate` is the closest GDACS analogue to EONET's "latest track point": for
 * an ongoing event it is the most recent reporting date, not the date it
 * started. Falls back to `fromdate` and then `datemodified` only when a field
 * is silently absent — a field that is *present but garbage* is not papered
 * over by trying the next one; it is counted as unplottable below, same as
 * EONET and USGS do for their own single date field.
 */
const dateFieldFor = (p: RawProperties): string | undefined =>
  p.todate || p.fromdate || p.datemodified || undefined;

/**
 * Formats whatever magnitude GDACS genuinely reported for this event, in its
 * own unit — never a fabricated one. Flood and volcano report `severity: 0`
 * with an empty `severityunit` in the live feed (nothing measured), so an
 * empty unit means "omit", not "zero". Earthquake magnitude arrives with one
 * clean decimal already (matching USGS's own "5.3 M" formatting) and is used
 * unrounded; wildfire (ha), drought (km2), and severe storm (km/h) round to
 * the nearest whole unit for display — storm km/h in particular carries
 * floating-point noise from GDACS's own kt→km/h conversion (e.g. 157.4064 for
 * an 85kt storm), which is a formatting concern, not a different value.
 */
const magnitudeFor = (category: string, sd: RawSeverityData | undefined): string | undefined => {
  const severity = sd?.severity;
  const unit = sd?.severityunit;
  if (typeof severity !== "number" || !Number.isFinite(severity) || !unit) return undefined;
  const value = category === "earthquake" ? severity : Math.round(severity);
  return `${value} ${unit}`;
};

export const normaliseGdacs = (
  raw: unknown,
  categoryWeights: Record<string, number>
): NormalisedEvents => {
  const payload = raw as { features?: RawFeature[] } | null;
  const features = payload?.features;
  if (!Array.isArray(features)) return { events: [], unplottable: 0 };

  const events: LayerEvent[] = [];
  let unplottable = 0;

  for (const f of features) {
    const p = f.properties;

    // GDACS's SEARCH endpoint returns a rolling window of roughly a year,
    // and most of it is closed disasters: 92 of the 100 events in the
    // committed live fixture carry iscurrent: "false", with todate values
    // up to eleven months old. Plotting those on a "live" globe would
    // misrepresent it worse than the US-only wildfire gap this source
    // exists to fix, so anything not explicitly "true" is filtered here.
    // Filtered events are not unplottable — their geometry is fine, they
    // are simply not current — so they are excluded before that count is
    // ever touched.
    if (p?.iscurrent !== "true") continue;

    const c = f.geometry?.coordinates;
    const lon = Array.isArray(c) ? c[0] : undefined;
    const lat = Array.isArray(c) ? c[1] : undefined;

    if (!p?.eventid || typeof lon !== "number" || typeof lat !== "number") {
      unplottable += 1;
      continue;
    }

    const rawDate = dateFieldFor(p);
    const stamp = rawDate ? Date.parse(asUtc(rawDate)) : Date.now();
    if (!Number.isFinite(stamp)) {
      unplottable += 1;
      continue;
    }

    const category = GDACS_CATEGORY_MAP[p.eventtype ?? ""] ?? "other";
    // Explicit, like normalise-usgs.ts's `typeof mag === "number"`: relying
    // on ALERT_LEVEL_SEVERITY[null] coercing to the key "null" and missing
    // would be correct by accident, not by a guard anyone can see.
    const alertSeverity =
      typeof p.alertlevel === "string" ? severityFromAlertLevel(p.alertlevel) : undefined;
    const severity = alertSeverity ?? severityFromWeight(categoryWeights[category] ?? 0.6);
    const severityFrom: "magnitude" | "category" =
      alertSeverity !== undefined ? "magnitude" : "category";

    events.push({
      id: `gdacs:${p.eventid}`,
      layer: "hazards",
      category,
      title: p.name || "Untitled event",
      lon,
      lat,
      date: new Date(stamp).toISOString(),
      severity,
      severityFrom,
      magnitude: magnitudeFor(category, p.severitydata),
      source: "GDACS",
      url: p.url?.report || undefined,
    });
  }

  return { events, unplottable };
};

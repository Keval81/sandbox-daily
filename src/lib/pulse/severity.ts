export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

const MAG_LO = 4.5;   // the USGS 4.5_day feed's own floor
const MAG_HI = 7;
const SEV_LO = 0.3;
const SEV_HI = 1;

/**
 * USGS magnitude → 0..1. Anchored at 4.5 → 0.3 and 7.0 → 1.0 because the feed
 * we consume starts at 4.5, so a 4.5 must not render as "nothing happened".
 */
export const severityFromMagnitude = (mag: number): number => {
  if (!Number.isFinite(mag)) return SEV_LO;
  const t = (mag - MAG_LO) / (MAG_HI - MAG_LO);
  return clamp(SEV_LO + t * (SEV_HI - SEV_LO), SEV_LO, SEV_HI);
};

/**
 * The honest default for an event we cannot measure: an unrecognised unit, a
 * missing magnitude, or a category with no curve below.
 */
export const severityFromWeight = (weight: number): number => clamp(weight, 0, 1);

const WILDFIRE_ACRES_LO = 100;
const WILDFIRE_ACRES_HI = 500_000;
const WILDFIRE_SEV_LO = 0.25;
const WILDFIRE_SEV_HI = 1;

/**
 * Wildfire acres → 0..1, log10-linear. Fire area in the live EONET feed spans
 * three orders of magnitude (500 to 280,000 acres), so a linear map would
 * flatten everything below ~50,000 acres into the bottom fifth. Anchored at
 * 100 acres → 0.25 (near the smallest fire EONET tracks) and 500,000 acres →
 * 1.0 (a genuinely catastrophic burn). A non-finite or non-positive acreage
 * clamps to the floor rather than feeding log10 a value it can't take.
 */
export const severityFromWildfireAcres = (acres: number): number => {
  if (!Number.isFinite(acres) || acres <= 0) return WILDFIRE_SEV_LO;
  const t =
    (Math.log10(acres) - Math.log10(WILDFIRE_ACRES_LO)) /
    (Math.log10(WILDFIRE_ACRES_HI) - Math.log10(WILDFIRE_ACRES_LO));
  return clamp(
    WILDFIRE_SEV_LO + t * (WILDFIRE_SEV_HI - WILDFIRE_SEV_LO),
    WILDFIRE_SEV_LO,
    WILDFIRE_SEV_HI
  );
};

const STORM_KTS_LO = 30;
const STORM_KTS_HI = 137;
const STORM_SEV_LO = 0.3;
const STORM_SEV_HI = 1;

/**
 * Severe storm knots → 0..1, linear, Saffir-Simpson-shaped. Anchored at 30
 * kts (below tropical-storm force) → 0.3 and 137 kts (the category 5
 * threshold) → 1.0.
 */
export const severityFromStormKts = (kts: number): number => {
  if (!Number.isFinite(kts)) return STORM_SEV_LO;
  const t = (kts - STORM_KTS_LO) / (STORM_KTS_HI - STORM_KTS_LO);
  return clamp(
    STORM_SEV_LO + t * (STORM_SEV_HI - STORM_SEV_LO),
    STORM_SEV_LO,
    STORM_SEV_HI
  );
};

/**
 * A category's magnitude curve, keyed by the unit it expects. A unit
 * mismatch (e.g. a wildfire reported in MW instead of acres) is treated the
 * same as no curve at all: it falls through to the category weight.
 */
const MAGNITUDE_CURVES: Record<string, { unit: string; curve: (value: number) => number }> = {
  wildfire: { unit: "acres", curve: severityFromWildfireAcres },
  severeStorm: { unit: "kts", curve: severityFromStormKts },
};

const ALERT_LEVEL_SEVERITY: Record<string, number> = {
  Green: 0.35,
  Orange: 0.65,
  Red: 0.95,
};

/**
 * GDACS's Green/Orange/Red is a real per-event impact assessment (their own
 * model, combining population exposure and hazard intensity) — comparable
 * across all six GDACS event types the way USGS magnitude is comparable
 * across earthquakes, unlike EONET's flat category weight. Anchors follow
 * GDACS's own ordering; sanity-checked against the committed live fixture
 * (79 Orange / 21 Red / 0 Green in the 100-event capture, 2026-07-30): the
 * two observed levels land 0.30 apart, a clear separation, so no adjustment
 * is warranted. Green never appeared in that capture but is one of exactly
 * three values GDACS documents, so its anchor is kept for whenever it does.
 * Returns undefined for a missing or unrecognised level so the caller can
 * fall back to the category weight and record that honestly.
 */
export const severityFromAlertLevel = (level: string | undefined): number | undefined =>
  level !== undefined ? ALERT_LEVEL_SEVERITY[level] : undefined;

export interface SeverityResult {
  severity: number;
  severityFrom: "magnitude" | "category";
}

/**
 * Derives an EONET event's severity from its reported magnitude wherever we
 * have a curve for the category and the reported unit matches what that
 * curve expects, falling back to the category weight everywhere else: an
 * unrecognised unit, a missing magnitude, or a category with no curve at
 * all. Provenance travels with the value so the UI never presents a baseline
 * as if it were a measurement.
 */
export const severityFor = (
  category: string,
  magnitudeValue: number | undefined,
  magnitudeUnit: string | undefined,
  categoryWeight: number
): SeverityResult => {
  const mapped = MAGNITUDE_CURVES[category];
  if (
    mapped &&
    typeof magnitudeValue === "number" &&
    Number.isFinite(magnitudeValue) &&
    magnitudeUnit === mapped.unit
  ) {
    return { severity: mapped.curve(magnitudeValue), severityFrom: "magnitude" };
  }
  return { severity: severityFromWeight(categoryWeight), severityFrom: "category" };
};

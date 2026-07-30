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
 * EONET reports magnitude in mutually incompatible units (kts for storms, MW
 * for fires) and often omits it. Those events take their category's weight.
 */
export const severityFromWeight = (weight: number): number => clamp(weight, 0, 1);

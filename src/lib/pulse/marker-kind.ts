import type { LayerEvent } from "./types";
import { severityFromMagnitude } from "./severity";

export type MarkerKind = "pin" | "ember";

/** The editorial bar for a quake pin, in severity space — M5.5 through the
 *  same curve normalise-usgs derives severity with, so no display-string
 *  parsing. GDACS alert-level severities pass through the same comparison:
 *  Orange (0.65) and Red (0.95) clear it, Green (0.35) does not. */
const QUAKE_PIN_SEVERITY = severityFromMagnitude(5.5);

/**
 * What earns a pin. FIRMS clusters are unnamed raw satellite detections —
 * texture, never a pin. Quakes tier by measured magnitude; an unmeasured
 * quake severity is a category baseline, not a reading, so it cannot clear
 * an editorial bar. Everything else (GDACS current events, EONET open
 * incidents, radar headlines) is already curated or named upstream.
 */
export const markerKindOf = (event: LayerEvent): MarkerKind => {
  if (event.source === "FIRMS") return "ember";
  if (event.category === "earthquake") {
    return event.severityFrom === "magnitude" && event.severity >= QUAKE_PIN_SEVERITY
      ? "pin"
      : "ember";
  }
  return "pin";
};

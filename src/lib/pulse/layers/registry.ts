import type { LayerSource } from "../types";
import { hazardsLayer } from "./hazards";
import { newsLayer } from "./news";

/**
 * Only registered layers render — a public page shows no dead "coming soon"
 * rows. Adding conflict/unrest/viral later is a new file plus one line here.
 */
export const PULSE_LAYERS: LayerSource[] = [hazardsLayer, newsLayer];

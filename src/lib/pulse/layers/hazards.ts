import type { CategoryMeta, LayerFetchResult, LayerSource, SourceStatus } from "../types";
import { normaliseEonet } from "../normalise-eonet";
import { normaliseUsgs } from "../normalise-usgs";
import { mergeLayers } from "../merge";
import { hazardIndex } from "../hazard-index";

const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7";
const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";

/** Ten minutes: EONET updates on the order of hours, and a news globe does not
 *  need per-second earthquake data. Upstream sees one request per ten minutes
 *  regardless of visitor count. */
const REVALIDATE_SECONDS = 600;

export const HAZARD_CATEGORIES: Record<string, CategoryMeta> = {
  wildfire:   { label: "Wildfire",      color: "#E75D31", weight: 1.0 },
  volcano:    { label: "Volcano",       color: "#FF2D55", weight: 1.05 },
  earthquake: { label: "Earthquake",    color: "#FFD60A", weight: 1.15 },
  severeStorm:{ label: "Severe Storm",  color: "#5AC8FA", weight: 1.15 },
  flood:      { label: "Flood",         color: "#0A84FF", weight: 1.0 },
  drought:    { label: "Drought",       color: "#C99A2E", weight: 0.7 },
  landslide:  { label: "Landslide",     color: "#BF8A5A", weight: 0.85 },
  seaLakeIce: { label: "Sea & Lake Ice", color: "#A0E9FF", weight: 0.45 },
  dustHaze:   { label: "Dust & Haze",   color: "#D9A066", weight: 0.55 },
  other:      { label: "Other",         color: "#98989D", weight: 0.6 },
};

export const CATEGORY_ORDER = [
  "wildfire", "volcano", "earthquake", "severeStorm", "flood",
  "drought", "landslide", "seaLakeIce", "dustHaze", "other",
];

const WEIGHTS = Object.fromEntries(
  Object.entries(HAZARD_CATEGORIES).map(([k, v]) => [k, v.weight])
);

const getJson = async (fetchImpl: typeof fetch, url: string): Promise<unknown> => {
  const res = await fetchImpl(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
};

const EONET_SOURCE = { id: "eonet", label: "EONET" };
const USGS_SOURCE = { id: "usgs", label: "USGS" };

/**
 * The layer swallows a feed's rejection so one dead source cannot blank the
 * page — but swallowing it silently is how "Live" ended up over nothing. The
 * outcome becomes a SourceStatus the HUD can read, and the reason is logged
 * once so an outage is diagnosable from the server log.
 */
const statusOf = (
  source: { id: string; label: string },
  result: PromiseSettledResult<unknown>
): SourceStatus => {
  if (result.status === "rejected") {
    console.error(`[pulse] ${source.id} feed unavailable`, result.reason);
  }
  return { ...source, live: result.status === "fulfilled" };
};

/** Injectable fetch so the layer is testable without touching the network. */
export const createHazardsLayer = (fetchImpl: typeof fetch): LayerSource => ({
  id: "hazards",
  label: "Natural hazards",
  categories: HAZARD_CATEGORIES,

  async fetch(): Promise<LayerFetchResult> {
    // allSettled, not all: one dead source degrades to partial data, never a
    // blank page.
    const [eonet, usgs] = await Promise.allSettled([
      getJson(fetchImpl, EONET_URL),
      getJson(fetchImpl, USGS_URL),
    ]);

    const sources = [statusOf(EONET_SOURCE, eonet), statusOf(USGS_SOURCE, usgs)];

    const a = eonet.status === "fulfilled"
      ? normaliseEonet(eonet.value, WEIGHTS)
      : { events: [], unplottable: 0 };
    const b = usgs.status === "fulfilled"
      ? normaliseUsgs(usgs.value)
      : { events: [], unplottable: 0 };

    return {
      events: mergeLayers([a.events, b.events]),
      unplottable: a.unplottable + b.unplottable,
      sources,
    };
  },

  index: (events) => hazardIndex(events, WEIGHTS),
});

export const hazardsLayer = createHazardsLayer(fetch);

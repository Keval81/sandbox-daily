import type { CategoryMeta, LayerFetchResult, LayerSource, SourceStatus } from "../types";
import { normaliseEonet } from "../normalise-eonet";
import { normaliseUsgs } from "../normalise-usgs";
import { normaliseGdacs } from "../normalise-gdacs";
import { mergeLayers } from "../merge";
import { hazardIndex } from "../hazard-index";
import { REVALIDATE_SECONDS } from "../freshness";

const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7";
// The week feed, not the day feed: a single day of M4.5+ is ~15 quakes and
// reads as "the Pacific rim plus nothing" — a week (~130) is what actually
// shows Europe, Africa and Asia/Australia their own seismicity. mergeLayers'
// 50km/2h rule still collapses the GDACS overlap.
const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson";
// EONET's wildfires come from IRWIN (US interagency) and its typhoons from
// JTWC (US Navy) — the only two providers EONET's open events actually carry
// right now, so every wildfire on the globe was a US state and eight of its
// ten categories returned nothing. GDACS (the EU/UN Global Disaster Alert
// and Coordination System) is a genuinely global, keyless feed that covers
// the same six hazard types with real non-US events: see
// docs/superpowers/specs/2026-07-26-planet-pulse-design.md.
/** Empty fromDate/toDate on purpose — GDACS's default "current events" view.
 *  An explicit 14-day range was tried for wider coverage and takes their API
 *  over two MINUTES to answer (it appears to scan the archive), which reads
 *  as a permanently dead feed under any sane timeout. The default view
 *  answers in ~1s and carries the active floods/cyclones/droughts. */
const GDACS_URL =
  "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?fromDate=&toDate=&alertlevel=&eventlist=EQ;TC;FL;VO;DR;WF";

// REVALIDATE_SECONDS — ten minutes: EONET updates on the order of hours, and a
// news globe does not need per-second earthquake data. Upstream sees one request
// per ten minutes regardless of visitor count. It lives in ../freshness because
// the UI has to know how old the data behind a snapshot can be.

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

/** A hung upstream must not stall a page regeneration; ten seconds, then it is
 *  a dead source like any other and the HUD says so. Was 5s — during `next
 *  build`'s prerender the three feeds fetch while the machine is compiling,
 *  and EONET+GDACS both blew the 5s budget and shipped a quakes-only globe. */
const TIMEOUT_MS = 10_000;

const fetchJsonOnce = async (fetchImpl: typeof fetch, url: string): Promise<unknown> => {
  const res = await fetchImpl(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
};

/** One sequential retry: these feeds flake under `next build`'s prerender load
 *  (EONET and GDACS both shipped dead in a quakes-only build), and a second
 *  attempt a beat later usually lands. Two strikes is still bounded — a feed
 *  that fails twice is honestly dead for this round and the HUD says so. */
const getJson = async (fetchImpl: typeof fetch, url: string): Promise<unknown> => {
  try {
    return await fetchJsonOnce(fetchImpl, url);
  } catch {
    return fetchJsonOnce(fetchImpl, url);
  }
};

const EONET_SOURCE = { id: "eonet", label: "EONET" };
const USGS_SOURCE = { id: "usgs", label: "USGS" };
const GDACS_SOURCE = { id: "gdacs", label: "GDACS" };

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
  categoryOrder: CATEGORY_ORDER,

  async fetch(): Promise<LayerFetchResult> {
    // allSettled, not all: one dead source degrades to partial data, never a
    // blank page.
    const [eonet, usgs, gdacs] = await Promise.allSettled([
      getJson(fetchImpl, EONET_URL),
      getJson(fetchImpl, USGS_URL),
      getJson(fetchImpl, GDACS_URL),
    ]);

    const sources = [
      statusOf(EONET_SOURCE, eonet),
      statusOf(USGS_SOURCE, usgs),
      statusOf(GDACS_SOURCE, gdacs),
    ];

    const a = eonet.status === "fulfilled"
      ? normaliseEonet(eonet.value, WEIGHTS)
      : { events: [], unplottable: 0 };
    const b = usgs.status === "fulfilled"
      ? normaliseUsgs(usgs.value)
      : { events: [], unplottable: 0 };
    // GDACS quakes overlapping USGS, and GDACS wildfires overlapping EONET's
    // IRWIN fires, both collapse through mergeLayers' existing 50km/2h rule.
    // USGS wins a quake collapse (preferred() rule — it carries a precise
    // magnitude); a wildfire collapse has no such tiebreaker, so whichever
    // of EONET/GDACS is listed first wins arbitrarily. Acceptable: it drops
    // a duplicate marker, not real coverage — the surviving record still
    // plots the same fire.
    const c = gdacs.status === "fulfilled"
      ? normaliseGdacs(gdacs.value, WEIGHTS)
      : { events: [], unplottable: 0 };

    return {
      events: mergeLayers([a.events, b.events, c.events]),
      unplottable: a.unplottable + b.unplottable + c.unplottable,
      sources,
    };
  },

  index: (events) => hazardIndex(events, WEIGHTS),
});

export const hazardsLayer = createHazardsLayer(fetch);

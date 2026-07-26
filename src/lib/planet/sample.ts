import type { HazardEvent } from "./types";

// Bundled fallback used only when every live upstream is unreachable (e.g. an
// offline dev sandbox). Representative, globally-spread events so the globe is
// never empty. Coordinates are real place locations; details are illustrative.
const raw: Array<Omit<HazardEvent, "id" | "source"> & { id: string }> = [
  { id: "s-wf-1", title: "Wildfire — Northern California, USA", category: "wildfire", lon: -121.6, lat: 39.8, date: "2026-07-25T18:00:00Z", severity: 0.9, magnitude: "active" },
  { id: "s-wf-2", title: "Wildfire — Attica, Greece", category: "wildfire", lon: 23.9, lat: 38.1, date: "2026-07-26T06:00:00Z", severity: 0.8, magnitude: "active" },
  { id: "s-wf-3", title: "Bushfire — New South Wales, Australia", category: "wildfire", lon: 150.4, lat: -33.7, date: "2026-07-24T22:00:00Z", severity: 0.72, magnitude: "active" },
  { id: "s-wf-4", title: "Wildfire — Alberta, Canada", category: "wildfire", lon: -114.1, lat: 55.2, date: "2026-07-25T12:00:00Z", severity: 0.65, magnitude: "active" },
  { id: "s-wf-5", title: "Wildfire — Siberia, Russia", category: "wildfire", lon: 108.3, lat: 61.5, date: "2026-07-25T03:00:00Z", severity: 0.85, magnitude: "active" },
  { id: "s-wf-6", title: "Wildfire — Amazonas, Brazil", category: "wildfire", lon: -63.2, lat: -4.3, date: "2026-07-24T15:00:00Z", severity: 0.7, magnitude: "active" },
  { id: "s-wf-7", title: "Wildfire — Andalusia, Spain", category: "wildfire", lon: -4.5, lat: 37.1, date: "2026-07-26T09:00:00Z", severity: 0.6, magnitude: "active" },
  { id: "s-wf-8", title: "Wildfire — Cape Town region, South Africa", category: "wildfire", lon: 18.9, lat: -33.9, date: "2026-07-23T11:00:00Z", severity: 0.5, magnitude: "active" },

  { id: "s-vo-1", title: "Volcanic activity — Kīlauea, Hawaii", category: "volcano", lon: -155.3, lat: 19.4, date: "2026-07-25T20:00:00Z", severity: 0.75, magnitude: "erupting" },
  { id: "s-vo-2", title: "Volcanic activity — Mount Etna, Italy", category: "volcano", lon: 15.0, lat: 37.7, date: "2026-07-24T08:00:00Z", severity: 0.6, magnitude: "active" },
  { id: "s-vo-3", title: "Volcanic activity — Merapi, Indonesia", category: "volcano", lon: 110.4, lat: -7.5, date: "2026-07-25T05:00:00Z", severity: 0.68, magnitude: "active" },

  { id: "s-eq-1", title: "M6.2 Earthquake — offshore Japan", category: "earthquake", lon: 142.4, lat: 38.3, date: "2026-07-26T04:12:00Z", severity: 0.82, magnitude: "M6.2" },
  { id: "s-eq-2", title: "M5.4 Earthquake — central Chile", category: "earthquake", lon: -71.3, lat: -33.5, date: "2026-07-25T21:44:00Z", severity: 0.62, magnitude: "M5.4" },
  { id: "s-eq-3", title: "M4.9 Earthquake — southern California, USA", category: "earthquake", lon: -117.0, lat: 34.1, date: "2026-07-26T02:03:00Z", severity: 0.5, magnitude: "M4.9" },
  { id: "s-eq-4", title: "M5.8 Earthquake — eastern Türkiye", category: "earthquake", lon: 39.6, lat: 38.4, date: "2026-07-25T14:30:00Z", severity: 0.7, magnitude: "M5.8" },
  { id: "s-eq-5", title: "M6.6 Earthquake — Sumatra, Indonesia", category: "earthquake", lon: 100.6, lat: -0.9, date: "2026-07-24T19:10:00Z", severity: 0.9, magnitude: "M6.6" },

  { id: "s-st-1", title: "Tropical Cyclone — western Pacific", category: "severeStorm", lon: 130.0, lat: 15.0, date: "2026-07-26T00:00:00Z", severity: 0.88, magnitude: "Cat 3" },
  { id: "s-st-2", title: "Hurricane — Gulf of Mexico", category: "severeStorm", lon: -90.0, lat: 24.0, date: "2026-07-25T18:00:00Z", severity: 0.8, magnitude: "Cat 2" },
  { id: "s-st-3", title: "Tropical Storm — Bay of Bengal", category: "severeStorm", lon: 88.0, lat: 15.5, date: "2026-07-25T09:00:00Z", severity: 0.6, magnitude: "TS" },

  { id: "s-fl-1", title: "Flooding — Assam, India", category: "flood", lon: 92.9, lat: 26.2, date: "2026-07-24T10:00:00Z", severity: 0.7, magnitude: "major" },
  { id: "s-fl-2", title: "Flooding — Rhine basin, Germany", category: "flood", lon: 7.6, lat: 50.4, date: "2026-07-23T16:00:00Z", severity: 0.55, magnitude: "moderate" },

  { id: "s-dr-1", title: "Drought — Horn of Africa", category: "drought", lon: 42.5, lat: 6.0, date: "2026-07-20T00:00:00Z", severity: 0.65, magnitude: "severe" },

  { id: "s-ls-1", title: "Landslide — Himalayan foothills, Nepal", category: "landslide", lon: 84.1, lat: 28.2, date: "2026-07-25T07:00:00Z", severity: 0.5, magnitude: "reported" },

  { id: "s-ice-1", title: "Iceberg — Weddell Sea, Antarctica", category: "seaLakeIce", lon: -45.0, lat: -73.0, date: "2026-07-22T00:00:00Z", severity: 0.4, magnitude: "tracked" },

  { id: "s-dh-1", title: "Dust storm — Sahara, Mali", category: "dustHaze", lon: -3.0, lat: 18.0, date: "2026-07-25T13:00:00Z", severity: 0.45, magnitude: "active" },
];

export const SAMPLE_EVENTS: HazardEvent[] = raw.map((e) => ({
  ...e,
  source: "EONET",
}));

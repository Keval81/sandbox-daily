import { test } from "node:test";
import assert from "node:assert/strict";
import { createHazardsLayer, HAZARD_CATEGORIES, CATEGORY_ORDER } from "./layers/hazards";
import { PULSE_LAYERS } from "./layers/registry";
import eonetTraps from "./fixtures/eonet-traps.json" with { type: "json" };

/** One clean, current GDACS feature — enough to prove the third source wires
 *  in; the trap coverage itself lives in normalise-gdacs.test.ts. */
const gdacsStub = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [10, 20] },
      properties: {
        eventtype: "EQ",
        eventid: 5001,
        name: "Test Quake",
        url: { report: "https://gdacs.test/1" },
        alertlevel: "Orange",
        iscurrent: "true",
        fromdate: "2026-07-30T00:00:00",
        todate: "2026-07-30T00:00:00",
        datemodified: "2026-07-30T00:00:00",
        severitydata: { severity: 5.0, severityunit: "M" },
      },
    },
  ],
};

/** Three detections in one cell — enough for one FIRMS wildfire cluster.
 *  Deliberately in the Australian outback: the eonet-traps fixture's own
 *  wildfire sits at 38.1N 23.9E, and a stub cluster next to it would be
 *  eaten by the near-EONET suppression this file also tests. */
const firmsStub = [
  "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight",
  "-20.10,130.20,321.6,1.4,1.2,2026-08-01,0009,T,80,6.1NRT,298.4,25,D",
  "-20.15,130.25,321.6,1.4,1.2,2026-08-01,0009,T,80,6.1NRT,298.4,25,D",
  "-20.20,130.30,321.6,1.4,1.2,2026-08-01,0009,T,80,6.1NRT,298.4,25,D",
].join("\n");

const stubFetch = (byUrl: Record<string, unknown>, fail?: string): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(byUrl).find((k) => url.includes(k));
    if (fail && url.includes(fail)) throw new Error("upstream down");
    return {
      ok: true,
      json: async () => (key ? byUrl[key] : {}),
      text: async () => (key ? String(byUrl[key]) : ""),
    } as Response;
  }) as typeof fetch;

/** The layer logs each dead feed; these tests assert behaviour, not console noise. */
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const real = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = real;
  }
};

test("every ordered category has metadata, and every category is ordered", () => {
  for (const key of CATEGORY_ORDER) assert.ok(HAZARD_CATEGORIES[key], `${key} missing metadata`);
  assert.equal(CATEGORY_ORDER.length, Object.keys(HAZARD_CATEGORIES).length);
});

test("wildfire uses Cortex Orange, the site's brand token", () => {
  assert.equal(HAZARD_CATEGORIES.wildfire.color, "#E75D31");
});

test("fetches all four sources and merges them into one event list", async () => {
  const layer = createHazardsLayer(stubFetch({
    eonet: eonetTraps,
    usgs: { features: [{
      id: "us1",
      properties: { mag: 5, place: "Test Sea", time: 1785000000000, url: "https://usgs.test/1" },
      geometry: { coordinates: [10, 20, 5] },
    }] },
    gdacs: gdacsStub,
    firms: firmsStub,
  }));
  const { events, unplottable, sources } = await layer.fetch();
  assert.ok(events.some((e) => e.source === "EONET"));
  assert.ok(events.some((e) => e.source === "USGS"));
  assert.ok(events.some((e) => e.source === "GDACS"));
  assert.ok(events.some((e) => e.source === "FIRMS"));
  assert.equal(unplottable, 1); // the geometry-less EONET event
  assert.deepEqual(sources.map((s) => s.live), [true, true, true, true]);
});

test("a FIRMS cluster within a degree of a named EONET fire is suppressed", async () => {
  // eonet-traps carries a wildfire; park the FIRMS cluster on top of it.
  const eonetFire = (await createHazardsLayer(stubFetch({ eonet: eonetTraps }))
    .fetch()).events.find((e) => e.category === "wildfire" && e.source === "EONET");
  assert.ok(eonetFire, "fixture must carry an EONET wildfire");
  const onTop = [
    "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight",
    `${eonetFire.lat},${eonetFire.lon},321.6,1.4,1.2,2026-08-01,0009,T,80,6.1NRT,298.4,25,D`,
    `${eonetFire.lat + 0.05},${eonetFire.lon},321.6,1.4,1.2,2026-08-01,0009,T,80,6.1NRT,298.4,25,D`,
    `${eonetFire.lat},${eonetFire.lon + 0.05},321.6,1.4,1.2,2026-08-01,0009,T,80,6.1NRT,298.4,25,D`,
  ].join("\n");
  const layer = createHazardsLayer(stubFetch({ eonet: eonetTraps, firms: onTop }));
  const { events } = await quiet(() => layer.fetch());
  assert.equal(events.filter((e) => e.source === "FIRMS").length, 0);
});

test("one dead source degrades to partial data instead of throwing", async () => {
  const layer = createHazardsLayer(stubFetch({ eonet: eonetTraps, gdacs: gdacsStub, firms: firmsStub }, "usgs"));
  const { events, sources } = await quiet(() => layer.fetch());
  assert.ok(events.length > 0);
  assert.equal(events.every((e) => ["EONET", "GDACS", "FIRMS"].includes(e.source)), true);
  assert.deepEqual(sources, [
    { id: "eonet", label: "EONET", live: true },
    { id: "usgs", label: "USGS", live: false },
    { id: "gdacs", label: "GDACS", live: true },
    { id: "firms", label: "FIRMS", live: true },
  ]);
});

test("GDACS dead alone degrades to partial data, named in sources", async () => {
  const layer = createHazardsLayer(stubFetch({
    eonet: eonetTraps,
    usgs: { features: [{
      id: "us1",
      properties: { mag: 5, place: "Test Sea", time: 1785000000000, url: "https://usgs.test/1" },
      geometry: { coordinates: [10, 20, 5] },
    }] },
  }, "gdacs"));
  const { events, sources } = await quiet(() => layer.fetch());
  assert.ok(events.some((e) => e.source === "EONET"));
  assert.ok(events.some((e) => e.source === "USGS"));
  assert.equal(events.every((e) => e.source !== "GDACS"), true);
  assert.deepEqual(sources.filter((s) => !s.live).map((s) => s.label), ["GDACS"]);
});

test("all four sources dead yields an empty result, not a rejection", async () => {
  const layer = createHazardsLayer(stubFetch({}, "http"));
  const { events, unplottable, sources } = await quiet(() => layer.fetch());
  assert.deepEqual(events, []);
  assert.equal(unplottable, 0);
  // The result the caller sees is indistinguishable from "a calm planet" —
  // only these records tell it apart, which is why they exist.
  assert.deepEqual(sources.map((s) => s.live), [false, false, false, false]);
});

test("reports each feed's outcome so the HUD can name the one that died", async () => {
  const layer = createHazardsLayer(stubFetch(
    { usgs: { features: [] }, gdacs: gdacsStub },
    "eonet"
  ));
  const { sources } = await quiet(() => layer.fetch());
  assert.deepEqual(sources.filter((s) => !s.live).map((s) => s.label), ["EONET"]);
});

test("the layer scores its own events", async () => {
  const layer = createHazardsLayer(stubFetch({ eonet: eonetTraps }));
  const { events } = await layer.fetch();
  const index = layer.index?.(events);
  assert.ok(index && index.score >= 0 && index.score <= 100);
  assert.ok(typeof index?.band === "string");
});

test("the layer carries its own category ordering, so no panel imports it", () => {
  const layer = createHazardsLayer(stubFetch({}));
  assert.deepEqual(layer.categoryOrder, CATEGORY_ORDER);
  // Every registered layer must supply one, or the panel renders it empty.
  for (const l of PULSE_LAYERS) {
    assert.ok(Array.isArray(l.categoryOrder) && l.categoryOrder.length > 0, `${l.id} has no order`);
    for (const key of l.categoryOrder) assert.ok(l.categories[key], `${l.id}:${key} has no metadata`);
  }
});

test("the registry exposes the hazards and news layers, hazards first", () => {
  assert.deepEqual(PULSE_LAYERS.map((l) => l.id), ["hazards", "news"]);
});

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

const stubFetch = (byUrl: Record<string, unknown>, fail?: string): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(byUrl).find((k) => url.includes(k));
    if (fail && url.includes(fail)) throw new Error("upstream down");
    return {
      ok: true,
      json: async () => (key ? byUrl[key] : {}),
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

test("fetches all three sources and merges them into one event list", async () => {
  const layer = createHazardsLayer(stubFetch({
    eonet: eonetTraps,
    usgs: { features: [{
      id: "us1",
      properties: { mag: 5, place: "Test Sea", time: 1785000000000, url: "https://usgs.test/1" },
      geometry: { coordinates: [10, 20, 5] },
    }] },
    gdacs: gdacsStub,
  }));
  const { events, unplottable, sources } = await layer.fetch();
  assert.ok(events.some((e) => e.source === "EONET"));
  assert.ok(events.some((e) => e.source === "USGS"));
  assert.ok(events.some((e) => e.source === "GDACS"));
  assert.equal(unplottable, 1); // the geometry-less EONET event
  assert.deepEqual(sources.map((s) => s.live), [true, true, true]);
});

test("one dead source degrades to partial data instead of throwing", async () => {
  const layer = createHazardsLayer(stubFetch({ eonet: eonetTraps, gdacs: gdacsStub }, "usgs"));
  const { events, sources } = await quiet(() => layer.fetch());
  assert.ok(events.length > 0);
  assert.equal(events.every((e) => e.source === "EONET" || e.source === "GDACS"), true);
  assert.deepEqual(sources, [
    { id: "eonet", label: "EONET", live: true },
    { id: "usgs", label: "USGS", live: false },
    { id: "gdacs", label: "GDACS", live: true },
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

test("all three sources dead yields an empty result, not a rejection", async () => {
  const layer = createHazardsLayer(stubFetch({}, "http"));
  const { events, unplottable, sources } = await quiet(() => layer.fetch());
  assert.deepEqual(events, []);
  assert.equal(unplottable, 0);
  // The result the caller sees is indistinguishable from "a calm planet" —
  // only these records tell it apart, which is why they exist.
  assert.deepEqual(sources.map((s) => s.live), [false, false, false]);
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

test("the registry exposes the hazards layer", () => {
  assert.equal(PULSE_LAYERS.length, 1);
  assert.equal(PULSE_LAYERS[0].id, "hazards");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseEonet } from "./normalise-eonet";
import traps from "./fixtures/eonet-traps.json" with { type: "json" };
import live from "./fixtures/eonet-live.json" with { type: "json" };

const WEIGHTS: Record<string, number> = {
  wildfire: 1, volcano: 1.05, earthquake: 1.15, severeStorm: 1.15,
  flood: 1, drought: 0.7, landslide: 0.85, seaLakeIce: 0.45,
  dustHaze: 0.55, other: 0.6,
};

const byId = (id: string) => {
  const { events } = normaliseEonet(traps, WEIGHTS);
  const found = events.find((e) => e.id === id);
  assert.ok(found, `expected ${id} in normalised output`);
  return found;
};

test("maps EONET's camelCase plural category id to our singular key", () => {
  assert.equal(byId("eonet:EONET_6001").category, "wildfire");
  assert.equal(byId("eonet:EONET_6002").category, "severeStorm");
});

test("reads coordinates as [lon, lat], not [lat, lon]", () => {
  const fire = byId("eonet:EONET_6001");
  assert.equal(fire.lon, 23.9);
  assert.equal(fire.lat, 38.1);
});

test("plots a storm at its latest track point, not its first", () => {
  const storm = byId("eonet:EONET_6002");
  assert.equal(storm.lon, 128.7);
  assert.equal(storm.lat, 26.9);
  assert.equal(storm.date, "2026-07-25T18:00:00.000Z");
});

test("reduces a Polygon perimeter to its centroid", () => {
  const perimeter = byId("eonet:EONET_6003");
  assert.equal(perimeter.lon, -113);
  assert.equal(perimeter.lat, 55);
});

test("files an unmapped category under other rather than dropping the event", () => {
  assert.equal(byId("eonet:EONET_6004").category, "other");
});

test("drops an event with no usable geometry and counts it", () => {
  const { events, unplottable } = normaliseEonet(traps, WEIGHTS);
  assert.equal(events.some((e) => e.id === "eonet:EONET_6005"), false);
  assert.equal(unplottable, 1);
});

test("takes severity from the category weight, since EONET magnitude units are incompatible", () => {
  assert.equal(byId("eonet:EONET_6001").severity, 1);
  assert.equal(byId("eonet:EONET_6004").severity, 0.6);
});

test("formats magnitude for display only, when the feed supplies one", () => {
  assert.equal(byId("eonet:EONET_6001").magnitude, "610 MW");
  assert.equal(byId("eonet:EONET_6002").magnitude, undefined);
});

test("prefers the source's own page over the API link", () => {
  assert.equal(byId("eonet:EONET_6001").url, "https://example.test/fire");
  assert.equal(byId("eonet:EONET_6002").url, "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_6002");
});

test("survives the real live feed with every event plottable or counted", () => {
  const { events, unplottable } = normaliseEonet(live, WEIGHTS);
  assert.equal(events.length + unplottable, live.events.length);
  for (const e of events) {
    assert.ok(Number.isFinite(e.lat) && e.lat >= -90 && e.lat <= 90, `bad lat on ${e.id}`);
    assert.ok(Number.isFinite(e.lon) && e.lon >= -180 && e.lon <= 180, `bad lon on ${e.id}`);
    assert.ok(e.severity > 0 && e.severity <= 1, `bad severity on ${e.id}`);
  }
});

test("returns an empty result rather than throwing on a malformed payload", () => {
  assert.deepEqual(normaliseEonet({ nope: true }, WEIGHTS), { events: [], unplottable: 0 });
  assert.deepEqual(normaliseEonet(null, WEIGHTS), { events: [], unplottable: 0 });
});

test("counts an unparseable date instead of throwing and taking the feed down", () => {
  const raw = {
    events: [
      {
        id: "EONET_BAD",
        title: "Broken timestamp",
        categories: [{ id: "wildfires" }],
        geometry: [{ date: "yesterday-ish", type: "Point", coordinates: [10, 20] }],
      },
      {
        id: "EONET_GOOD",
        title: "Fine",
        categories: [{ id: "wildfires" }],
        geometry: [{ date: "2026-07-30T00:00:00Z", type: "Point", coordinates: [11, 21] }],
      },
    ],
  };
  const { events, unplottable } = normaliseEonet(raw, WEIGHTS);
  assert.deepEqual(events.map((e) => e.id), ["eonet:EONET_GOOD"]);
  assert.equal(unplottable, 1);
});

test("falls back to now when a geometry carries no date at all", () => {
  const raw = {
    events: [{
      id: "EONET_NODATE",
      title: "Undated",
      categories: [{ id: "wildfires" }],
      geometry: [{ type: "Point", coordinates: [10, 20] }],
    }],
  };
  const { events, unplottable } = normaliseEonet(raw, WEIGHTS);
  assert.equal(unplottable, 0);
  assert.ok(events[0].date.endsWith("Z"));
});

test("marks severity as a measurement for a category with no magnitude curve, never a baseline pretending otherwise", () => {
  // EONET_6004 files under "other" in the traps fixture — no curve exists for
  // that category, so it must take the honest category-weight fallback.
  assert.equal(byId("eonet:EONET_6004").severityFrom, "category");
});

test("derives severity from magnitude for every event in the live feed, since wildfire acres and storm knots are both fully covered there", () => {
  const { events } = normaliseEonet(live, WEIGHTS);
  assert.ok(events.length > 0);
  assert.equal(events.every((e) => e.severityFrom === "magnitude"), true);
});

test("wildfire severities spread across the real acreage distribution instead of collapsing to one value", () => {
  const { events } = normaliseEonet(live, WEIGHTS);
  const wildfires = events.filter((e) => e.category === "wildfire");
  assert.equal(wildfires.length, 42);
  assert.ok(wildfires.every((e) => e.severityFrom === "magnitude"));

  const distinct = new Set(wildfires.map((e) => e.severity));
  assert.ok(
    distinct.size >= 20,
    `expected a wide spread of distinct severities, got ${distinct.size}`
  );

  const min = Math.min(...wildfires.map((e) => e.severity));
  const max = Math.max(...wildfires.map((e) => e.severity));
  assert.ok(
    max - min > 0.3,
    `expected a substantial spread between min and max, got min ${min} max ${max}`
  );
});

test("severe storm severities are derived from knots in the live feed too", () => {
  const { events } = normaliseEonet(live, WEIGHTS);
  const storms = events.filter((e) => e.category === "severeStorm");
  assert.equal(storms.length, 4);
  assert.ok(storms.every((e) => e.severityFrom === "magnitude"));

  const distinct = new Set(storms.map((e) => e.severity));
  assert.ok(distinct.size >= 3, `expected storms to differ, got ${distinct.size}`);
});

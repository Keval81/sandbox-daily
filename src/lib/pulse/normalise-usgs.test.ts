import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseUsgs } from "./normalise-usgs";
import live from "./fixtures/usgs-live.json" with { type: "json" };

const FIXED = {
  features: [
    {
      id: "us7000t3g4",
      properties: {
        mag: 5.3,
        place: "112 km SSW of Tual, Indonesia",
        time: 1785000000000,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000t3g4",
      },
      geometry: { type: "Point", coordinates: [132.4, -6.7, 45.2] },
    },
    {
      id: "us7000broken",
      properties: { mag: 6.1, place: "Nowhere", time: 1785000000000, url: "" },
      geometry: null,
    },
  ],
};

test("reads coordinates as [lon, lat, depth] — inverting them plots the wrong hemisphere", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(events[0].lon, 132.4);
  assert.equal(events[0].lat, -6.7);
});

test("converts epoch milliseconds to an ISO timestamp", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(events[0].date, new Date(1785000000000).toISOString());
});

test("namespaces the id so it can never collide with an EONET id", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(events[0].id, "usgs:us7000t3g4");
});

test("files every quake under the earthquake category", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(events[0].category, "earthquake");
  assert.equal(events[0].source, "USGS");
});

test("derives severity from magnitude", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(Number(events[0].severity.toFixed(4)), 0.524);
});

test("shows magnitude with a unit suffix", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(events[0].magnitude, "5.3 M");
});

test("uses the place description as the title", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(events[0].title, "112 km SSW of Tual, Indonesia");
});

test("drops a feature with no geometry and counts it", () => {
  const { events, unplottable } = normaliseUsgs(FIXED);
  assert.equal(events.length, 1);
  assert.equal(unplottable, 1);
});

test("survives the real live feed", () => {
  const { events, unplottable } = normaliseUsgs(live);
  assert.equal(events.length + unplottable, live.features.length);
  for (const e of events) {
    assert.ok(e.lat >= -90 && e.lat <= 90, `bad lat on ${e.id}`);
    assert.ok(e.lon >= -180 && e.lon <= 180, `bad lon on ${e.id}`);
    assert.ok(e.date.endsWith("Z"), `bad date on ${e.id}`);
  }
});

test("returns an empty result rather than throwing on a malformed payload", () => {
  assert.deepEqual(normaliseUsgs({}), { events: [], unplottable: 0 });
  assert.deepEqual(normaliseUsgs(null), { events: [], unplottable: 0 });
});

test("counts an unusable epoch instead of throwing and taking the feed down", () => {
  const raw = {
    features: [
      {
        id: "us-nan",
        properties: { mag: 5, place: "Bad time", time: Number.NaN, url: "" },
        geometry: { coordinates: [10, 20, 5] },
      },
      {
        id: "us-huge",
        properties: { mag: 5, place: "Out of range", time: 8.64e15 + 1, url: "" },
        geometry: { coordinates: [11, 21, 5] },
      },
      {
        id: "us-ok",
        properties: { mag: 5, place: "Fine", time: 1785000000000, url: "" },
        geometry: { coordinates: [12, 22, 5] },
      },
    ],
  };
  const { events, unplottable } = normaliseUsgs(raw);
  assert.deepEqual(events.map((e) => e.id), ["usgs:us-ok"]);
  assert.equal(unplottable, 2);
});

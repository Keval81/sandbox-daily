import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLayers, distanceKm } from "./merge";
import type { LayerEvent } from "./types";

const quake = (over: Partial<LayerEvent>): LayerEvent => ({
  id: "eonet:EONET_1", layer: "hazards", category: "earthquake",
  title: "M 6.1 - Banda Sea", lat: -6.7, lon: 132.4,
  date: "2026-07-30T10:00:00.000Z", severity: 0.9, source: "EONET", ...over,
});

test("measures great-circle distance to within a kilometre", () => {
  // London to Paris is ~344 km.
  const d = distanceKm(51.5074, -0.1278, 48.8566, 2.3522);
  assert.ok(d > 335 && d < 350, `expected ~344 km, got ${d}`);
});

test("returns zero distance for the same point", () => {
  assert.equal(Math.round(distanceKm(10, 20, 10, 20)), 0);
});

test("collapses the same quake reported by both sources", () => {
  const merged = mergeLayers([
    [quake({})],
    [quake({ id: "usgs:us7000t3g4", source: "USGS", magnitude: "6.1 M", lat: -6.72, lon: 132.43 })],
  ]);
  assert.equal(merged.length, 1);
});

test("keeps the USGS record, because it carries a precise magnitude", () => {
  const merged = mergeLayers([
    [quake({})],
    [quake({ id: "usgs:us7000t3g4", source: "USGS", magnitude: "6.1 M", lat: -6.72, lon: 132.43 })],
  ]);
  assert.equal(merged[0].source, "USGS");
  assert.equal(merged[0].magnitude, "6.1 M");
});

test("keeps two events of different categories at the same spot and time", () => {
  const merged = mergeLayers([
    [quake({})],
    [quake({ id: "usgs:x", category: "volcano", source: "USGS" })],
  ]);
  assert.equal(merged.length, 2);
});

test("keeps two events further apart than the distance threshold", () => {
  // ~600 km of longitude at this latitude — well outside 50 km.
  const merged = mergeLayers([
    [quake({})],
    [quake({ id: "usgs:x", source: "USGS", lon: 138.4 })],
  ]);
  assert.equal(merged.length, 2);
});

test("keeps two events further apart than the time threshold", () => {
  const merged = mergeLayers([
    [quake({})],
    [quake({ id: "usgs:x", source: "USGS", date: "2026-07-30T18:00:00.000Z" })],
  ]);
  assert.equal(merged.length, 2);
});

test("returns everything untouched when there is nothing to collapse", () => {
  const merged = mergeLayers([[quake({}), quake({ id: "eonet:2", lat: 40, lon: -3 })]]);
  assert.equal(merged.length, 2);
});

test("sorts the merged output newest first", () => {
  const merged = mergeLayers([[
    quake({ id: "a", date: "2026-07-28T00:00:00.000Z", lat: 10, lon: 10 }),
    quake({ id: "b", date: "2026-07-30T00:00:00.000Z", lat: 40, lon: 40 }),
  ]]);
  assert.equal(merged[0].id, "b");
});

test("handles an empty input", () => {
  assert.deepEqual(mergeLayers([]), []);
  assert.deepEqual(mergeLayers([[], []]), []);
});

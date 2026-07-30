import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deadSourceLabels, everySourceDead, freshnessOf, STALE_AFTER_MS,
} from "./freshness";
import type { PulseLayerSummary, PulseSnapshot } from "./types";

const GENERATED = "2026-07-30T12:00:00.000Z";
const SEEDED = Date.parse(GENERATED);   // what `now` is on the first render

const layer = (over: Partial<PulseLayerSummary> = {}): PulseLayerSummary => ({
  id: "hazards",
  label: "Natural hazards",
  categories: {},
  categoryOrder: [],
  sources: [
    { id: "eonet", label: "EONET", live: true },
    { id: "usgs", label: "USGS", live: true },
  ],
  live: true,
  index: null,
  ...over,
});

const snapshot = (layers: PulseLayerSummary[], stale = false): PulseSnapshot => ({
  generatedAt: GENERATED,
  stale,
  events: [],
  unplottable: 0,
  layers,
});

test("names each dead feed, not the layer that wraps them", () => {
  const partial = layer({
    sources: [
      { id: "eonet", label: "EONET", live: false },
      { id: "usgs", label: "USGS", live: true },
    ],
    live: true,
  });
  assert.deepEqual(deadSourceLabels([partial]), ["EONET"]);
});

test("falls back to the layer's own label when it reported no sources at all", () => {
  assert.deepEqual(deadSourceLabels([layer({ sources: [], live: false })]), ["Natural hazards"]);
});

test("names nothing when every feed answered", () => {
  assert.deepEqual(deadSourceLabels([layer()]), []);
});

test("an empty registry is not an outage", () => {
  assert.equal(everySourceDead([]), false);
});

test("a live snapshot reads Live at the moment it is rendered", () => {
  assert.deepEqual(freshnessOf(snapshot([layer()]), SEEDED), { label: "Live", live: true });
});

test("a snapshot served from the last-good cache reads Snapshot", () => {
  assert.deepEqual(
    freshnessOf(snapshot([layer()], true), SEEDED),
    { label: "Snapshot", live: false }
  );
});

test("a total outage reads Snapshot even when freshly assembled", () => {
  const dead = layer({
    sources: [
      { id: "eonet", label: "EONET", live: false },
      { id: "usgs", label: "USGS", live: false },
    ],
    live: false,
  });
  assert.equal(everySourceDead([dead]), true);
  assert.deepEqual(freshnessOf(snapshot([dead]), SEEDED), { label: "Snapshot", live: false });
});

test("Live ages out of Live once the snapshot outlives two refresh windows", () => {
  const snap = snapshot([layer()]);
  // A tab left open: nothing refetches, only the client's 60s tick moves `now`.
  assert.equal(freshnessOf(snap, SEEDED + STALE_AFTER_MS).label, "Live");
  assert.equal(freshnessOf(snap, SEEDED + STALE_AFTER_MS + 1).label, "Snapshot");
  assert.equal(freshnessOf(snap, SEEDED + 9 * 60 * 60 * 1000).live, false);
});

test("is hydration-safe: age is zero when now is seeded from generatedAt", () => {
  // The server render and the first client render both pass exactly this value.
  assert.deepEqual(freshnessOf(snapshot([layer()]), SEEDED), { label: "Live", live: true });
});

test("an unparseable generatedAt does not age a snapshot into Snapshot", () => {
  const broken = { ...snapshot([layer()]), generatedAt: "not a date" };
  assert.equal(freshnessOf(broken, SEEDED).label, "Live");
});

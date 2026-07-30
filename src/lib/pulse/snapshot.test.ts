import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot } from "./snapshot";
import { createHazardsLayer } from "./layers/hazards";
import type { LayerEvent, LayerFetchResult } from "./types";

const NOW = "2026-07-30T12:00:00.000Z";
const layer = createHazardsLayer(fetch);

const ev = (id: string): LayerEvent => ({
  id, layer: "hazards", category: "wildfire", title: "Fire",
  lat: 1, lon: 2, date: NOW, severity: 0.9, source: "EONET",
});

const ok = (r: LayerFetchResult): PromiseSettledResult<LayerFetchResult> =>
  ({ status: "fulfilled", value: r });
const dead = (): PromiseSettledResult<LayerFetchResult> =>
  ({ status: "rejected", reason: new Error("down") });

test("reports the real fetch time and marks fresh data as not stale", () => {
  const snap = buildSnapshot([layer], [ok({ events: [ev("a")], unplottable: 0 })], NOW);
  assert.equal(snap.generatedAt, NOW);
  assert.equal(snap.stale, false);
});

test("carries the unplottable count through to the snapshot", () => {
  const snap = buildSnapshot([layer], [ok({ events: [ev("a")], unplottable: 3 })], NOW);
  assert.equal(snap.events.length, 1);
  assert.equal(snap.unplottable, 3);
});

test("marks a layer live when its fetch succeeded", () => {
  const snap = buildSnapshot([layer], [ok({ events: [ev("a")], unplottable: 0 })], NOW);
  assert.equal(snap.layers[0].live, true);
  assert.equal(snap.layers[0].id, "hazards");
});

test("marks a layer not live when its fetch rejected, without throwing", () => {
  const snap = buildSnapshot([layer], [dead()], NOW);
  assert.equal(snap.layers[0].live, false);
  assert.deepEqual(snap.events, []);
});

test("includes the layer's own index for the HUD", () => {
  const snap = buildSnapshot([layer], [ok({ events: [ev("a"), ev("b")], unplottable: 0 })], NOW);
  assert.ok(snap.layers[0].index);
  assert.ok((snap.layers[0].index?.score ?? -1) >= 0);
});

test("ships the category metadata so the UI never hardcodes colours", () => {
  const snap = buildSnapshot([layer], [ok({ events: [], unplottable: 0 })], NOW);
  assert.equal(snap.layers[0].categories.wildfire.color, "#E75D31");
});

test("an all-dead snapshot is empty rather than fabricated", () => {
  const snap = buildSnapshot([layer], [dead()], NOW);
  assert.equal(snap.events.length, 0);
  assert.equal(snap.stale, false); // freshly fetched nothing — not stale data
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryKey, eventKey } from "./category-key";
import type { LayerEvent } from "./types";

const ev = (layer: string, category: string): LayerEvent => ({
  id: `${layer}:1`, layer, category, title: "Event",
  lat: 0, lon: 0, date: "2026-07-30T00:00:00.000Z", severity: 0.5, source: "TEST",
});

test("keeps the same category key distinct across layers", () => {
  assert.notEqual(categoryKey("hazards", "other"), categoryKey("unrest", "other"));
});

test("keys an event by its own layer, not by category alone", () => {
  assert.equal(eventKey(ev("hazards", "wildfire")), categoryKey("hazards", "wildfire"));
  assert.notEqual(eventKey(ev("hazards", "other")), eventKey(ev("unrest", "other")));
});

test("keys are stable for the same layer and category", () => {
  assert.equal(eventKey(ev("hazards", "flood")), eventKey(ev("hazards", "flood")));
});

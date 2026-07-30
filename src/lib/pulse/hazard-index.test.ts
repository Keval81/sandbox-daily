import { test } from "node:test";
import assert from "node:assert/strict";
import { hazardIndex, scoreBand } from "./hazard-index";
import type { LayerEvent } from "./types";

const WEIGHTS: Record<string, number> = { wildfire: 1, earthquake: 1.15, drought: 0.7, other: 0.6 };

const ev = (n: number, severity: number, category = "wildfire"): LayerEvent => ({
  id: `e${n}`, layer: "hazards", category, title: `Event ${n}`,
  lat: 0, lon: 0, date: "2026-07-30T00:00:00.000Z", severity, source: "EONET",
});

test("scores an empty world as zero and calm", () => {
  const idx = hazardIndex([], WEIGHTS);
  assert.equal(idx.score, 0);
  assert.equal(idx.band, "Calm");
});

test("scores a handful of low-severity events as calm", () => {
  const idx = hazardIndex([ev(1, 0.2), ev(2, 0.25), ev(3, 0.15)], WEIGHTS);
  assert.ok(idx.score < 25, `expected < 25, got ${idx.score}`);
  assert.equal(idx.band, "Calm");
});

test("scores a world full of extreme events near the top of the scale", () => {
  const many = Array.from({ length: 40 }, (_, i) => ev(i, 1, "earthquake"));
  const idx = hazardIndex(many, WEIGHTS);
  assert.ok(idx.score >= 75, `expected >= 75, got ${idx.score}`);
  assert.equal(idx.band, "Severe");
});

test("weights an earthquake above a drought at identical severity", () => {
  const quakes = hazardIndex(Array.from({ length: 12 }, (_, i) => ev(i, 0.8, "earthquake")), WEIGHTS);
  const droughts = hazardIndex(Array.from({ length: 12 }, (_, i) => ev(i, 0.8, "drought")), WEIGHTS);
  assert.ok(quakes.score > droughts.score);
});

test("counts breadth — many moderate events outscore a single extreme one", () => {
  const one = hazardIndex([ev(1, 1)], WEIGHTS);
  const many = hazardIndex(Array.from({ length: 25 }, (_, i) => ev(i, 0.7)), WEIGHTS);
  assert.ok(many.score > one.score);
});

test("falls back to a default weight for an unknown category", () => {
  const idx = hazardIndex([ev(1, 1, "notARealCategory")], WEIGHTS);
  assert.ok(idx.score > 0);
});

test("bands on the documented thresholds", () => {
  assert.equal(scoreBand(0).band, "Calm");
  assert.equal(scoreBand(24).band, "Calm");
  assert.equal(scoreBand(25).band, "Elevated");
  assert.equal(scoreBand(49).band, "Elevated");
  assert.equal(scoreBand(50).band, "High");
  assert.equal(scoreBand(74).band, "High");
  assert.equal(scoreBand(75).band, "Severe");
  assert.equal(scoreBand(100).band, "Severe");
});

test("uses site tokens for the calm and high bands", () => {
  assert.equal(scoreBand(10).color, "#56A077");
  assert.equal(scoreBand(60).color, "#E75D31");
});

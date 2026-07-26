import { test } from "node:test";
import assert from "node:assert/strict";
import { disasterScore, bandFor } from "./score";
import type { HazardEvent } from "./types";

function ev(category: HazardEvent["category"], severity: number): HazardEvent {
  return {
    id: `${category}-${severity}-${Math.round(severity * 1000)}`,
    title: "t",
    category,
    lon: 0,
    lat: 0,
    date: new Date(0).toISOString(),
    severity,
    source: "EONET",
  };
}

test("empty feed scores 0 / Calm", () => {
  const r = disasterScore([]);
  assert.equal(r.score, 0);
  assert.equal(r.band, "Calm");
});

test("score is within 0..100 and rises with severity", () => {
  const low = disasterScore([ev("wildfire", 0.2), ev("wildfire", 0.1)]);
  const high = disasterScore([
    ev("earthquake", 0.95),
    ev("severeStorm", 0.9),
    ev("volcano", 0.88),
    ev("wildfire", 0.85),
  ]);
  for (const r of [low, high]) {
    assert.ok(r.score >= 0 && r.score <= 100);
  }
  assert.ok(high.score > low.score);
});

test("a full-severity broad feed approaches the Severe band", () => {
  const events = Array.from({ length: 30 }, (_, i) =>
    ev(i % 2 ? "earthquake" : "severeStorm", 0.95)
  );
  const r = disasterScore(events);
  assert.ok(r.score >= 75, `expected Severe, got ${r.score}`);
  assert.equal(r.band, "Severe");
});

test("bandFor thresholds", () => {
  assert.equal(bandFor(0).band, "Calm");
  assert.equal(bandFor(24).band, "Calm");
  assert.equal(bandFor(25).band, "Elevated");
  assert.equal(bandFor(50).band, "High");
  assert.equal(bandFor(75).band, "Severe");
});

test("score does not run away with many tiny events", () => {
  const many = Array.from({ length: 400 }, () => ev("dustHaze", 0.2));
  const r = disasterScore(many);
  // low-intensity hazards, so it should stay well below Severe.
  assert.ok(r.score < 50, `expected < 50, got ${r.score}`);
});

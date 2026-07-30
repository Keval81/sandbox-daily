import { test } from "node:test";
import assert from "node:assert/strict";
import {
  severityFromMagnitude,
  severityFromWeight,
  severityFromWildfireAcres,
  severityFromStormKts,
  severityFromAlertLevel,
  severityFor,
} from "./severity";

test("maps the bottom of the USGS feed's range to 0.3", () => {
  assert.equal(severityFromMagnitude(4.5), 0.3);
});

test("maps magnitude 7.0 to the top of the scale", () => {
  assert.equal(severityFromMagnitude(7), 1);
});

test("interpolates linearly between the two anchors", () => {
  assert.equal(Number(severityFromMagnitude(5.75).toFixed(4)), 0.65);
});

test("clamps below the lower anchor rather than returning a negative severity", () => {
  assert.equal(severityFromMagnitude(2.1), 0.3);
});

test("clamps above the upper anchor rather than exceeding 1", () => {
  assert.equal(severityFromMagnitude(9.4), 1);
});

test("treats a non-finite magnitude as the lower anchor", () => {
  assert.equal(severityFromMagnitude(Number.NaN), 0.3);
});

test("falls back to the category weight when a source reports no usable magnitude", () => {
  assert.equal(severityFromWeight(0.7), 0.7);
});

test("clamps a category weight above 1 into range", () => {
  assert.equal(severityFromWeight(1.15), 1);
});

// --- wildfire acres, log10-linear -----------------------------------------

test("maps the wildfire floor anchor: 100 acres to 0.25", () => {
  assert.equal(severityFromWildfireAcres(100), 0.25);
});

test("maps the wildfire ceiling anchor: 500,000 acres to 1.0", () => {
  assert.equal(severityFromWildfireAcres(500_000), 1);
});

test("interpolates wildfire acres log10-linearly between the anchors", () => {
  assert.equal(Number(severityFromWildfireAcres(500).toFixed(2)), 0.39);
  assert.equal(Number(severityFromWildfireAcres(3_000).toFixed(2)), 0.55);
  assert.equal(Number(severityFromWildfireAcres(280_000).toFixed(2)), 0.95);
});

test("clamps wildfire acres below the floor anchor rather than going negative", () => {
  assert.equal(severityFromWildfireAcres(10), 0.25);
});

test("clamps wildfire acres above the ceiling anchor rather than exceeding 1", () => {
  assert.equal(severityFromWildfireAcres(2_000_000), 1);
});

test("treats a non-finite or non-positive wildfire acreage as the floor anchor", () => {
  assert.equal(severityFromWildfireAcres(Number.NaN), 0.25);
  assert.equal(severityFromWildfireAcres(0), 0.25);
  assert.equal(severityFromWildfireAcres(-5), 0.25);
});

// --- severe storm knots, Saffir-Simpson-shaped, linear ---------------------

test("maps the storm floor anchor: 30 kts (below tropical-storm force) to 0.3", () => {
  assert.equal(severityFromStormKts(30), 0.3);
});

test("maps the storm ceiling anchor: 137 kts (category 5) to 1.0", () => {
  assert.equal(severityFromStormKts(137), 1);
});

test("interpolates storm knots linearly between the anchors", () => {
  assert.equal(Number(severityFromStormKts(80).toFixed(2)), 0.63);
  assert.equal(Number(severityFromStormKts(85).toFixed(2)), 0.66);
});

test("clamps storm knots below the floor anchor rather than going negative", () => {
  assert.equal(severityFromStormKts(10), 0.3);
});

test("clamps storm knots above the ceiling anchor rather than exceeding 1", () => {
  assert.equal(severityFromStormKts(180), 1);
});

test("treats a non-finite storm knot value as the floor anchor", () => {
  assert.equal(severityFromStormKts(Number.NaN), 0.3);
});

// --- GDACS alert level -------------------------------------------------------

test("maps GDACS's own alert levels to their anchors: Green, Orange, Red", () => {
  assert.equal(severityFromAlertLevel("Green"), 0.35);
  assert.equal(severityFromAlertLevel("Orange"), 0.65);
  assert.equal(severityFromAlertLevel("Red"), 0.95);
});

test("returns undefined for a missing or unrecognised alert level, so the caller can fall back honestly", () => {
  assert.equal(severityFromAlertLevel(undefined), undefined);
  assert.equal(severityFromAlertLevel("Purple"), undefined);
});

// --- severityFor: curve selection + provenance ------------------------------

test("severityFor derives wildfire severity from acres when the unit matches", () => {
  const result = severityFor("wildfire", 500, "acres", 1);
  assert.equal(result.severityFrom, "magnitude");
  assert.equal(Number(result.severity.toFixed(2)), 0.39);
});

test("severityFor derives severe storm severity from knots when the unit matches", () => {
  const result = severityFor("severeStorm", 85, "kts", 1.15);
  assert.equal(result.severityFrom, "magnitude");
  assert.equal(Number(result.severity.toFixed(2)), 0.66);
});

test("severityFor falls back to the category weight on an unrecognised unit", () => {
  const result = severityFor("wildfire", 610, "MW", 1);
  assert.equal(result.severityFrom, "category");
  assert.equal(result.severity, 1);
});

test("severityFor falls back to the category weight when magnitude is entirely absent", () => {
  const result = severityFor("wildfire", undefined, undefined, 1);
  assert.equal(result.severityFrom, "category");
  assert.equal(result.severity, 1);
});

test("severityFor falls back to the category weight for a category with no curve, even with a magnitude present", () => {
  const result = severityFor("earthquake", 6.2, "kts", 1.15);
  assert.equal(result.severityFrom, "category");
  assert.equal(result.severity, 1); // severityFromWeight clamps 1.15 into 0..1
});

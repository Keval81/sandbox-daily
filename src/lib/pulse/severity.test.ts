import { test } from "node:test";
import assert from "node:assert/strict";
import { severityFromMagnitude, severityFromWeight } from "./severity";

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

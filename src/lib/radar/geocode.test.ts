import { test } from "node:test";
import assert from "node:assert/strict";
import { geocodeHeadline, LONDON } from "./geocode";

test("finds a capital city named in a headline", () => {
  const hit = geocodeHeadline("Russian strikes on Kyiv kill at least nine");
  assert.ok(hit);
  assert.equal(hit.place, "Kyiv");
  assert.ok(Math.abs(hit.lat - 50.45) < 1);
});

test("a specific place beats the country and the demonym", () => {
  // "Russian" (demonym) and "Kyiv" (city) both match — the city wins.
  const hit = geocodeHeadline("Russian missile attack on Kyiv");
  assert.equal(hit?.place, "Kyiv");
});

test("falls back to a country name when no city matches", () => {
  const hit = geocodeHeadline("Race to rescue climbers after avalanche in Pakistan");
  assert.equal(hit?.place, "Pakistan");
});

test("falls back to a demonym when only nationality is named", () => {
  const hit = geocodeHeadline("Peruvian ex-president leaves jail after 15 years");
  assert.equal(hit?.place, "Peru");
});

test("matches on whole words only, never substrings", () => {
  // "Iran" must not fire inside "Irandel" or similar; use an invented word.
  assert.equal(geocodeHeadline("The Iranholme festival opens"), null);
});

test("is case-insensitive", () => {
  assert.equal(geocodeHeadline("ceasefire talks in GAZA stall")?.place, "Gaza");
});

test("returns null for a headline naming no known place", () => {
  assert.equal(geocodeHeadline("Why M&S selling crotchless pants is peak retail"), null);
});

test("exports London for radar events already tagged location=london", () => {
  assert.ok(Math.abs(LONDON.lat - 51.5) < 0.2);
  assert.ok(Math.abs(LONDON.lon - -0.12) < 0.2);
});

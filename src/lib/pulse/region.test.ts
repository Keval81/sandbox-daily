import { test } from "node:test";
import assert from "node:assert/strict";
import { regionOf, describeLocation, REGION_IDS } from "./region";

test("names the region for a land point on every continent", () => {
  assert.equal(regionOf(38.0, 23.7).label, "Southern Europe");      // Athens
  assert.equal(regionOf(52.5, 13.4).label, "Central Europe");       // Berlin
  assert.equal(regionOf(55.8, 37.6).label, "Eastern Europe");       // Moscow
  assert.equal(regionOf(30.0, 31.2).label, "North Africa");         // Cairo
  assert.equal(regionOf(6.5, 3.4).label, "West Africa");            // Lagos
  assert.equal(regionOf(-1.3, 36.8).label, "East Africa");          // Nairobi
  assert.equal(regionOf(-26.2, 28.0).label, "Southern Africa");     // Johannesburg
  assert.equal(regionOf(31.8, 35.2).label, "The Middle East");      // Jerusalem
  assert.equal(regionOf(28.6, 77.2).label, "South Asia");           // Delhi
  assert.equal(regionOf(39.9, 116.4).label, "East Asia");           // Beijing
  assert.equal(regionOf(-6.2, 106.8).label, "Southeast Asia");      // Jakarta
  assert.equal(regionOf(62.0, 105.0).label, "Siberia");             // central Siberia
  assert.equal(regionOf(-33.9, 151.2).label, "Australia");          // Sydney
  assert.equal(regionOf(40.7, -74.0).label, "North America");       // New York
  assert.equal(regionOf(-23.5, -46.6).label, "South America");      // Sao Paulo
});

test("every region id has a label, and ids are unique", () => {
  const ids = REGION_IDS;
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(id.length > 0);
});

test("open ocean falls back to a named basin, never a landmass", () => {
  assert.equal(regionOf(0, -140).label, "The Pacific");
  assert.equal(regionOf(-30, -20).label, "The Atlantic");
  assert.equal(regionOf(-20, 80).label, "The Indian Ocean");
});

test("the poles are named, not squeezed into a neighbouring continent", () => {
  assert.equal(regionOf(-80, 0).label, "Antarctica");
  assert.equal(regionOf(88, 0).label, "The Arctic");
});

test("describeLocation names the nearest known place when one is close", () => {
  // ~40km from Athens.
  assert.equal(describeLocation(38.3, 23.5), "near Athens · Southern Europe");
});

test("describeLocation gives the region alone when nothing is near", () => {
  // Mid-Pacific: no gazetteer entry within the threshold.
  assert.equal(describeLocation(0, -140), "The Pacific");
});

test("describeLocation never claims a place across an ocean", () => {
  // Mid-Atlantic is nearer to Africa/S.America than the threshold allows.
  const d = describeLocation(-20, -25);
  assert.equal(d, "The Atlantic");
});

test("longitude wrap does not break the nearest-place search", () => {
  // Just east of the antimeridian, near Fiji (178.07E).
  const d = describeLocation(-17.5, -179.5);
  assert.match(d, /Fiji|Pacific/);
});

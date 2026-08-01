import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseFirms, FIRMS_MIN_CONFIDENCE, FIRMS_MIN_POINTS } from "./normalise-firms";
import { regionOf } from "./region";

const HEADER =
  "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight";

const row = (lat: number, lon: number, conf = 80, frp = 25, date = "2026-08-01", time = "0009") =>
  `${lat},${lon},321.6,1.4,1.2,${date},${time},T,${conf},6.1NRT,298.4,${frp},D`;

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

test("clusters nearby detections into one wildfire event at the FRP-weighted centre", () => {
  const { events } = normaliseFirms(
    csv(row(38.1, 23.2, 80, 10), row(38.3, 23.4, 90, 30), row(38.2, 23.3, 85, 20))
  );
  assert.equal(events.length, 1);
  const e = events[0];
  assert.equal(e.category, "wildfire");
  assert.equal(e.layer, "hazards");
  assert.equal(e.source, "FIRMS");
  // FRP-weighted centre pulls toward the strongest detection.
  assert.ok(e.lat > 38.2 - 0.05 && e.lat < 38.3);
  assert.ok(e.magnitude?.includes("3 hotspots"));
});

test("severity is a measured reading and grows with total fire power", () => {
  const small = normaliseFirms(
    csv(row(10, 10, 80, 5), row(10.1, 10.1, 80, 5), row(10.2, 10.2, 80, 5))
  ).events[0];
  const big = normaliseFirms(
    csv(row(50, 50, 80, 900), row(50.1, 50.1, 80, 900), row(50.2, 50.2, 80, 900))
  ).events[0];
  assert.equal(small.severityFrom, "magnitude");
  assert.ok(big.severity > small.severity);
  assert.ok(big.severity <= 1);
});

test("low-confidence detections are ignored", () => {
  const { events } = normaliseFirms(
    csv(
      row(20, 20, FIRMS_MIN_CONFIDENCE - 1),
      row(20.1, 20.1, FIRMS_MIN_CONFIDENCE - 1),
      row(20.2, 20.2, FIRMS_MIN_CONFIDENCE - 1)
    )
  );
  assert.equal(events.length, 0);
});

test("a cell needs a minimum of detections — lone pixels are noise, not fires", () => {
  const rows = Array.from({ length: FIRMS_MIN_POINTS - 1 }, (_, i) => row(30 + i * 0.01, 30));
  assert.equal(normaliseFirms(csv(...rows)).events.length, 0);
});

test("caps the cluster list", () => {
  const rows: string[] = [];
  for (let i = 0; i < 130; i++) {
    // 130 distinct cells, 3 points each, ascending FRP.
    for (let j = 0; j < 3; j++) rows.push(row(-60 + i, 100, 80, i + 1));
  }
  const { events } = normaliseFirms(csv(...rows), 100);
  assert.equal(events.length, 100);
  assert.ok(events.every((e) => (e.magnitude ?? "").length > 0));
});

test("a continent's fire season cannot crowd every other region off the globe", () => {
  const rows: string[] = [];
  // 60 huge African savanna clusters (1000 MW each), one per 1-degree cell ...
  for (let i = 0; i < 30; i++) {
    for (const lat of [-5, -6]) {
      for (let j = 0; j < 3; j++) rows.push(row(lat + 0.1 * j, 10 + i, 80, 1000));
    }
  }
  // ... against 5 small European ones (20 MW each). Under a pure
  // sort-by-power cap, Europe is invisible; the whole point of the regional
  // allocation is that it is not.
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) rows.push(row(38 + 0.1 * j, 20 + i, 80, 20));
  }
  const { events } = normaliseFirms(csv(...rows), 20);
  const regions = events.map((e) => regionOf(e.lat, e.lon).id);
  assert.ok(regions.includes("s-europe"), "Europe must survive the cap");
  assert.ok(regions.some((r) => r.endsWith("-africa")), "Africa must still be represented");
});

test("within a region the strongest fires are the ones kept", () => {
  const rows: string[] = [];
  // Ten Southern-Europe cells (one per degree of longitude), FRP ascending.
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 3; j++) rows.push(row(38 + 0.1 * j, 15 + i, 80, (i + 1) * 10));
  }
  const { events } = normaliseFirms(csv(...rows), 3);
  assert.equal(events.length, 3);
  // Strongest three = the three easternmost cells in this fixture.
  const lons = events.map((e) => Math.floor(e.lon)).sort((a, b) => a - b);
  assert.deepEqual(lons, [22, 23, 24]);
});

test("malformed rows are counted unplottable, not fatal", () => {
  const { events, unplottable } = normaliseFirms(
    csv(row(38.1, 23.2), row(38.15, 23.25), row(38.2, 23.3), "not,a,valid,row")
  );
  assert.equal(events.length, 1);
  assert.equal(unplottable, 1);
});

test("cluster ids are stable for the same cell across runs", () => {
  const a = normaliseFirms(csv(row(38.1, 23.2), row(38.15, 23.25), row(38.2, 23.3))).events[0];
  const b = normaliseFirms(csv(row(38.11, 23.21), row(38.16, 23.26), row(38.21, 23.31))).events[0];
  assert.equal(a.id, b.id);
});

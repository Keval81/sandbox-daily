import test from "node:test";
import assert from "node:assert/strict";
import type { LayerEvent } from "./types";
import { markerKindOf } from "./marker-kind";
import { severityFromMagnitude, severityFromAlertLevel } from "./severity";

const event = (over: Partial<LayerEvent>): LayerEvent => ({
  id: "x:1",
  layer: "hazards",
  category: "earthquake",
  title: "An event",
  lat: 0,
  lon: 0,
  date: "2026-08-04T00:00:00.000Z",
  severity: 0.5,
  severityFrom: "magnitude",
  source: "USGS",
  ...over,
});

test("a FIRMS fire cluster is always an ember", () => {
  const e = event({ source: "FIRMS", category: "wildfire", severity: 1, severityFrom: "magnitude" });
  assert.equal(markerKindOf(e), "ember");
});

test("a quake at or above M5.5 is a pin", () => {
  const e = event({ severity: severityFromMagnitude(5.5) });
  assert.equal(markerKindOf(e), "pin");
});

test("a quake below M5.5 is an ember", () => {
  const e = event({ severity: severityFromMagnitude(5.4) });
  assert.equal(markerKindOf(e), "ember");
});

test("a quake with no measured magnitude is an ember even at high baseline severity", () => {
  const e = event({ severity: 0.9, severityFrom: "category" });
  assert.equal(markerKindOf(e), "ember");
});

test("a GDACS orange-alert quake clears the bar; a green one does not", () => {
  const orange = event({ source: "GDACS", severity: severityFromAlertLevel("Orange")! });
  const green = event({ source: "GDACS", severity: severityFromAlertLevel("Green")! });
  assert.equal(markerKindOf(orange), "pin");
  assert.equal(markerKindOf(green), "ember");
});

test("named hazards and headlines are pins regardless of severity", () => {
  for (const over of [
    { source: "GDACS", category: "flood", severity: 0.2 },
    { source: "EONET", category: "severeStorm", severity: 0.3, severityFrom: "category" as const },
    { source: "Radar", layer: "news", category: "headline", severity: 0.1 },
    { source: "GDACS", category: "volcano", severity: 0.35 },
  ]) {
    assert.equal(markerKindOf(event(over)), "pin", JSON.stringify(over));
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseGdacs } from "./normalise-gdacs";
import traps from "./fixtures/gdacs-traps.json" with { type: "json" };
import live from "./fixtures/gdacs-live.json" with { type: "json" };

const WEIGHTS: Record<string, number> = {
  wildfire: 1, volcano: 1.05, earthquake: 1.15, severeStorm: 1.15,
  flood: 1, drought: 0.7, landslide: 0.85, seaLakeIce: 0.45,
  dustHaze: 0.55, other: 0.6,
};

const byId = (id: string) => {
  const { events } = normaliseGdacs(traps, WEIGHTS);
  const found = events.find((e) => e.id === id);
  assert.ok(found, `expected ${id} in normalised output`);
  return found;
};

test("maps GDACS's two-letter event codes to our category keys", () => {
  assert.equal(byId("gdacs:1001").category, "earthquake");
  assert.equal(byId("gdacs:1002").category, "severeStorm");
  assert.equal(byId("gdacs:1003").category, "flood");
  assert.equal(byId("gdacs:1004").category, "volcano");
  assert.equal(byId("gdacs:1005").category, "drought");
  assert.equal(byId("gdacs:1006").category, "wildfire");
});

test("namespaces the id so it can never collide with an EONET or USGS id", () => {
  assert.equal(byId("gdacs:1001").id, "gdacs:1001");
});

test("reads coordinates as [lon, lat] — a Japan quake lands in Japan, not the Atlantic", () => {
  const quake = byId("gdacs:1001");
  assert.equal(quake.lon, 139.6503);
  assert.equal(quake.lat, 35.6762);
});

test("a France wildfire lands in France, not the ocean", () => {
  const fire = byId("gdacs:1006");
  assert.equal(fire.lon, -1.0328);
  assert.equal(fire.lat, 44.8463);
});

test("files an unmapped event code under other rather than dropping the event", () => {
  assert.equal(byId("gdacs:1007").category, "other");
});

test("drops an event with no usable geometry and counts it, without throwing", () => {
  const { events, unplottable } = normaliseGdacs(traps, WEIGHTS);
  assert.equal(events.some((e) => e.id === "gdacs:1008"), false);
  assert.ok(unplottable >= 1);
});

test("drops an event with non-numeric coordinates and counts it", () => {
  const { events } = normaliseGdacs(traps, WEIGHTS);
  assert.equal(events.some((e) => e.id === "gdacs:1009"), false);
});

test("counts an unparseable date instead of throwing and taking the feed down", () => {
  const { events } = normaliseGdacs(traps, WEIGHTS);
  assert.equal(events.some((e) => e.id === "gdacs:1010"), false);
});

test("drops an event with no eventid and counts it, since there is nothing to namespace", () => {
  const { events } = normaliseGdacs(traps, WEIGHTS);
  assert.equal(events.some((e) => e.title === "Broken Event - No eventid"), false);
});

test("silently filters a non-current event, and does not count it as unplottable", () => {
  const { events, unplottable } = normaliseGdacs(traps, WEIGHTS);
  assert.equal(events.some((e) => e.id === "gdacs:1012"), false);
  // The trap set has exactly 4 unplottable-but-current records: no geometry
  // (1008), non-numeric coordinates (1009), an unparseable date (1010), and
  // no eventid at all. The non-current record (1012) must not add a fifth —
  // it is filtered before the unplottable count is ever touched.
  assert.equal(unplottable, 4);
});

test("GDACS's own alert level drives severity, with honest provenance: Red, Orange, Green", () => {
  const red = byId("gdacs:1001");
  assert.equal(red.severity, 0.95);
  assert.equal(red.severityFrom, "magnitude");

  const orange = byId("gdacs:1002");
  assert.equal(orange.severity, 0.65);
  assert.equal(orange.severityFrom, "magnitude");

  const green = byId("gdacs:1004");
  assert.equal(green.severity, 0.35);
  assert.equal(green.severityFrom, "magnitude");
});

test("falls back to the category weight when alertlevel is missing or unrecognised", () => {
  const flood = byId("gdacs:1003");
  assert.equal(flood.severityFrom, "category");
  assert.equal(flood.severity, WEIGHTS.flood);
});

test("formats an earthquake magnitude unrounded, like USGS", () => {
  assert.equal(byId("gdacs:1001").magnitude, "6.8 M");
});

test("rounds a noisy unit-converted magnitude for display, without changing the underlying severity", () => {
  // 157.4064 km/h is GDACS's own kt→km/h conversion of an 85kt storm; the
  // floating-point noise is a formatting concern only.
  assert.equal(byId("gdacs:1002").magnitude, "157 km/h");
});

test("formats wildfire and drought magnitudes with the feed's own unit", () => {
  assert.equal(byId("gdacs:1006").magnitude, "47885 ha");
  assert.equal(byId("gdacs:1005").magnitude, "488851 km2");
});

test("omits magnitude rather than fabricating a unit GDACS didn't report", () => {
  // Flood and volcano report severity 0 with an empty severityunit in the
  // live feed — there is genuinely nothing to display.
  assert.equal(byId("gdacs:1003").magnitude, undefined);
  assert.equal(byId("gdacs:1004").magnitude, undefined);
});

test("falls back to an Untitled event title when name is blank", () => {
  assert.equal(byId("gdacs:1013").title, "Untitled event");
});

test("prefers the human report page over the raw API endpoints for the url", () => {
  assert.equal(
    byId("gdacs:1001").url,
    "https://www.gdacs.org/report.aspx?eventid=1001&episodeid=1&eventtype=EQ"
  );
});

test("leaves url undefined rather than fabricating one when the feed has none", () => {
  assert.equal(byId("gdacs:1014").url, undefined);
});

test("treats GDACS's bare date strings as UTC, not the server's local time", () => {
  // fromdate/todate/datemodified in the live feed carry no "Z" or offset.
  // Date.parse treats that shape as LOCAL time per the ES spec — on a
  // non-UTC server this would silently shift every event by the server's
  // offset. "2026-07-28T07:27:15" must resolve to the UTC instant, not
  // whatever the host machine's timezone says.
  assert.equal(byId("gdacs:1001").date, "2026-07-28T07:27:15.000Z");
});

test("prefers todate over fromdate, matching EONET's latest-observation convention", () => {
  // 1002's fromdate is 2026-07-23T06:00:00, todate is 2026-07-26T00:00:00.
  assert.equal(byId("gdacs:1002").date, "2026-07-26T00:00:00.000Z");
});

test("returns an empty result rather than throwing on a malformed payload", () => {
  assert.deepEqual(normaliseGdacs({ nope: true }, WEIGHTS), { events: [], unplottable: 0 });
  assert.deepEqual(normaliseGdacs(null, WEIGHTS), { events: [], unplottable: 0 });
});

test("survives the real live feed with every current event plottable or counted", () => {
  const { events, unplottable } = normaliseGdacs(live, WEIGHTS);
  const currentFeatures = (live as { features: { properties?: { iscurrent?: string } }[] }).features
    .filter((f) => f.properties?.iscurrent === "true");
  // Pinned against the committed fixture: GDACS's SEARCH endpoint returns a
  // rolling window of roughly a year, most of it closed disasters. Only the
  // events GDACS itself still marks current belong on a live globe.
  assert.equal(live.features.length, 100);
  assert.equal(currentFeatures.length, 8);
  assert.equal(events.length + unplottable, currentFeatures.length);

  for (const e of events) {
    assert.ok(Number.isFinite(e.lat) && e.lat >= -90 && e.lat <= 90, `bad lat on ${e.id}`);
    assert.ok(Number.isFinite(e.lon) && e.lon >= -180 && e.lon <= 180, `bad lon on ${e.id}`);
    assert.ok(e.severity > 0 && e.severity <= 1, `bad severity on ${e.id}`);
  }
});

test("the live feed's current events break down as 4 wildfire, 3 earthquake, 1 flood", () => {
  const { events } = normaliseGdacs(live, WEIGHTS);
  const byCategory = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(byCategory, { wildfire: 4, earthquake: 3, flood: 1 });
});

test("every current live event carries a real alert level, so severity is measured, never a baseline", () => {
  const { events } = normaliseGdacs(live, WEIGHTS);
  assert.ok(events.length > 0);
  assert.equal(events.every((e) => e.severityFrom === "magnitude"), true);
});

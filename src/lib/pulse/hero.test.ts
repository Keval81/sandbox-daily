import { test } from "node:test";
import assert from "node:assert/strict";
import { GHOST_CHIPS, chipsFromLayers, deriveHeroStatus, eventCardsById, markersFromSnapshot } from "./hero";
import { buildSnapshot } from "./snapshot";
import type { LayerEvent, LayerSource, PulseLayerSummary, PulseSnapshot } from "./types";

const GENERATED = "2026-07-31T12:00:00.000Z";
const NOW = Date.parse(GENERATED);

const event = (over: Partial<LayerEvent>): LayerEvent => ({
  id: "usgs:x1", layer: "hazards", category: "earthquake", title: "Somewhere",
  lat: 10, lon: 20, date: GENERATED, severity: 0.5, source: "USGS", ...over,
});

// Two layers, deliberately: pins the wars/unrest future as a data change.
const hazards = (over: Partial<PulseLayerSummary> = {}): PulseLayerSummary => ({
  id: "hazards", label: "hazard",
  categories: {
    earthquake: { label: "Earthquake", color: "#E75D31", weight: 0.8 },
    flood: { label: "Flood", color: "#56A077", weight: 0.6 },
  },
  categoryOrder: ["earthquake", "flood"],
  sources: [{ id: "usgs", label: "USGS", live: true }],
  live: true,
  index: { score: 84, band: "Severe", color: "#FF2D55" },
  ...over,
});
const unrest = (over: Partial<PulseLayerSummary> = {}): PulseLayerSummary => ({
  id: "unrest", label: "unrest",
  categories: { protest: { label: "Protest", color: "#FFD60A", weight: 0.5 } },
  categoryOrder: ["protest"],
  sources: [{ id: "radar", label: "Radar", live: true }],
  live: true,
  index: { score: 30, band: "Elevated", color: "#FFD60A" },
  ...over,
});
const snap = (layers: PulseLayerSummary[], events: LayerEvent[], stale = false): PulseSnapshot =>
  ({ generatedAt: GENERATED, stale, events, unplottable: 0, layers });

test("live snapshot: totals count all live layers' events, layer-agnostic", () => {
  const s = snap([hazards(), unrest()], [
    event({ id: "a" }), event({ id: "b", category: "flood" }),
    event({ id: "c", layer: "unrest", category: "protest" }),
  ]);
  const h = deriveHeroStatus(s, NOW);
  assert.equal(h.mode, "live");
  assert.equal(h.totalEvents, 3);
});

test("index chips: one per live layer with an index, never a combined score", () => {
  const h = deriveHeroStatus(snap([hazards(), unrest()], [event({})]), NOW);
  assert.deepEqual(h.indexChips.map((c) => c.layerId), ["hazards", "unrest"]);
  assert.equal(h.indexChips[0].score, 84);
  assert.equal(h.indexChips[1].band, "Elevated");
});

test("a dead layer contributes no chip and no events to the total", () => {
  const deadUnrest = unrest({ live: false, sources: [{ id: "radar", label: "Radar", live: false }], index: null });
  const s = snap([hazards(), deadUnrest], [
    event({ id: "a" }), event({ id: "c", layer: "unrest", category: "protest" }),
  ]);
  const h = deriveHeroStatus(s, NOW);
  assert.equal(h.mode, "live");           // one live layer keeps the pip green
  assert.equal(h.totalEvents, 1);         // the dead layer's event is not counted
  assert.deepEqual(h.indexChips.map((c) => c.layerId), ["hazards"]);
});

test("whisper: top 4 category labels by count across live layers", () => {
  const events = [
    event({ id: "1" }), event({ id: "2" }), event({ id: "3", category: "flood" }),
    event({ id: "4", layer: "unrest", category: "protest" }),
  ];
  const h = deriveHeroStatus(snap([hazards(), unrest()], events), NOW);
  assert.deepEqual(h.whisper, [
    { label: "Earthquake", count: 2 },
    { label: "Flood", count: 1 },
    { label: "Protest", count: 1 },
  ]);
});

test("stale snapshot: mode snapshot, everything withheld", () => {
  const h = deriveHeroStatus(snap([hazards()], [event({})], true), NOW);
  assert.equal(h.mode, "snapshot");
  assert.equal(h.totalEvents, null);
  assert.deepEqual(h.indexChips, []);
  assert.deepEqual(h.whisper, []);
});

test("every source dead: mode snapshot even when the snapshot is not stale", () => {
  const dead = hazards({ live: false, sources: [{ id: "usgs", label: "USGS", live: false }], index: null });
  const h = deriveHeroStatus(snap([dead], [event({})]), NOW);
  assert.equal(h.mode, "snapshot");
  assert.equal(h.totalEvents, null);
});

test("an aged snapshot left open goes snapshot mode (freshnessOf rule)", () => {
  const h = deriveHeroStatus(snap([hazards()], [event({})]), NOW + 21 * 60 * 1000);
  assert.equal(h.mode, "snapshot");
});

test("aside comes from the worst live band's pool, deterministically by day", () => {
  const h = deriveHeroStatus(snap([hazards(), unrest()], [event({})]), NOW);
  // worst band across chips is Severe (84); same generatedAt → same line
  const again = deriveHeroStatus(snap([hazards(), unrest()], [event({})]), NOW);
  assert.equal(typeof h.aside, "string");
  assert.equal(h.aside, again.aside);
});

test("zero events with live feeds gets a real 'nothing to report' aside", () => {
  const calm = hazards({ index: { score: 0, band: "Calm", color: "#56A077" } });
  const h = deriveHeroStatus(snap([calm], []), NOW);
  assert.equal(h.totalEvents, 0);
  assert.match(h.aside ?? "", /quiet|nothing|day off/i);
});

test("no live band → no aside (asides never fabricate)", () => {
  const noIndex = hazards({ index: null });
  const h = deriveHeroStatus(snap([noIndex], [event({})]), NOW);
  assert.equal(h.aside, null);
});

test("markers colour by the event's OWN layer; dimming greys and shrinks", () => {
  const s = snap([hazards(), unrest()], [
    event({ id: "a" }),
    event({ id: "c", layer: "unrest", category: "protest" }),
  ]);
  const [a, c] = markersFromSnapshot(s, false);
  assert.equal(a.color, "#E75D31");
  assert.equal(c.color, "#FFD60A");
  const [dimA] = markersFromSnapshot(s, true);
  assert.equal(dimA.color, "#98989D");
  assert.ok(dimA.weight < a.weight);
});

test("dead layer's events are skipped by the globe in non-dimmed mode; dimmed mode keeps them, greyed", () => {
  const deadUnrest = unrest({ live: false, sources: [{ id: "radar", label: "Radar", live: false }], index: null });
  const s = snap([hazards(), deadUnrest], [
    event({ id: "a" }),
    event({ id: "c", layer: "unrest", category: "protest" }),
  ]);

  const live = markersFromSnapshot(s, false);
  assert.deepEqual(live.map((m) => m.id), ["a"]); // dead layer's marker is gone, not just greyed

  const dimmed = markersFromSnapshot(s, true);
  assert.deepEqual(dimmed.map((m) => m.id), ["a", "c"]); // stale-snapshot mode still greys everything
  assert.equal(dimmed.find((m) => m.id === "c")?.color, "#98989D");
});

test("REGRESSION: both feeds throwing drives the hero to snapshot mode", async () => {
  const throwing: LayerSource = {
    id: "hazards", label: "hazard", categories: {}, categoryOrder: [],
    fetch: async () => { throw new Error("feed down"); },
  };
  const results = await Promise.allSettled([throwing.fetch()]);
  const s = buildSnapshot([throwing], results, GENERATED);
  const h = deriveHeroStatus(s, Date.parse(s.generatedAt));
  assert.equal(h.mode, "snapshot");
  assert.equal(h.totalEvents, null);
  assert.deepEqual(h.indexChips, []);
});

test("eventCardsById: a magnitude event carries severityWord + segments + owning-layer colour", () => {
  const s = snap([hazards()], [
    event({ id: "a", category: "earthquake", severity: 0.8, severityFrom: "magnitude", magnitude: "6.1 M" }),
  ]);
  const cards = eventCardsById(s, NOW);
  const card = cards.get("a");
  assert.ok(card);
  assert.equal(card?.eyebrow, "EARTHQUAKE");
  assert.equal(card?.title, "Somewhere");
  assert.equal(card?.magnitude, "6.1 M");
  assert.equal(card?.severity, 0.8);
  assert.equal(card?.severityWord, "SEVERE");
  assert.equal(card?.segments, 4);
  assert.equal(card?.color, "#E75D31");
});

test("eventCardsById: a category-baseline event has severityWord null but still segments", () => {
  const s = snap([hazards()], [
    event({ id: "b", category: "flood", severity: 0.6, severityFrom: "category" }),
  ]);
  const withProvenance = eventCardsById(s, NOW).get("b");
  assert.equal(withProvenance?.severityWord, null);
  assert.equal(withProvenance?.segments, 3);

  const noProvenance = eventCardsById(snap([hazards()], [
    event({ id: "c", category: "flood", severity: 0.6 }),
  ]), NOW).get("c");
  assert.equal(noProvenance?.severityWord, null);
});

test("eventCardsById: events from both layers present in the map keyed by id", () => {
  const s = snap([hazards(), unrest()], [
    event({ id: "a" }),
    event({ id: "c", layer: "unrest", category: "protest" }),
  ]);
  const cards = eventCardsById(s, NOW);
  assert.equal(cards.size, 2);
  assert.ok(cards.has("a"));
  assert.ok(cards.has("c"));
  assert.equal(cards.get("c")?.color, "#FFD60A");
  assert.equal(cards.get("c")?.eyebrow, "PROTEST");
});

test("eventCardsById: a dead layer's events are excluded, mirroring markersFromSnapshot", () => {
  const deadUnrest = unrest({ live: false, sources: [{ id: "radar", label: "Radar", live: false }], index: null });
  const s = snap([hazards(), deadUnrest], [
    event({ id: "a" }),
    event({ id: "c", layer: "unrest", category: "protest" }),
  ]);
  const cards = eventCardsById(s, NOW);
  assert.deepEqual([...cards.keys()], ["a"]);
});

test("eventCardsById: stale snapshot returns an empty map (no cards in snapshot mode)", () => {
  const s = snap([hazards()], [event({ id: "a" })], true);
  assert.equal(eventCardsById(s, NOW).size, 0);
});

test("eventCardsById: every source dead returns an empty map even when not marked stale", () => {
  const dead = hazards({ live: false, sources: [{ id: "usgs", label: "USGS", live: false }], index: null });
  const s = snap([dead], [event({ id: "a" })]);
  assert.equal(eventCardsById(s, NOW).size, 0);
});

test("eventCardsById: an aged snapshot left open goes empty, matching deriveHeroStatus's snapshot mode", () => {
  const s = snap([hazards()], [event({ id: "a" })]);
  assert.equal(eventCardsById(s, NOW + 21 * 60 * 1000).size, 0);
});

test("eventCardsById: segments rounds severity*5, clamped 0..5 (0.9 -> 5, 0.09 -> 0)", () => {
  const s = snap([hazards()], [
    event({ id: "hi", severity: 0.9 }),
    event({ id: "lo", severity: 0.09 }),
  ]);
  const cards = eventCardsById(s, NOW);
  assert.equal(cards.get("hi")?.segments, 5);
  assert.equal(cards.get("lo")?.segments, 0);
});

test("eventCardsById: url passes through, null when absent", () => {
  const s = snap([hazards()], [
    event({ id: "withUrl", url: "https://example.com/a" }),
    event({ id: "noUrl" }),
  ]);
  const cards = eventCardsById(s, NOW);
  assert.equal(cards.get("withUrl")?.url, "https://example.com/a");
  assert.equal(cards.get("noUrl")?.url, null);
});

test("chipsFromLayers: one chip per snapshot layer, in order, with live flags", () => {
  const deadUnrest = unrest({ live: false, sources: [{ id: "radar", label: "Radar", live: false }], index: null });
  const s = snap([hazards(), deadUnrest], []);
  assert.deepEqual(chipsFromLayers(s), [
    { id: "hazards", label: "hazard", live: true },
    { id: "unrest", label: "unrest", live: false },
  ]);
});

test("GHOST_CHIPS: hardcoded ghost copy, not derived from layers", () => {
  assert.deepEqual(GHOST_CHIPS, ["CONFLICT", "UNREST"]);
});

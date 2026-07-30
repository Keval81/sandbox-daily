import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, getPulseSnapshot, __resetPulseCache } from "./snapshot";
import { createHazardsLayer } from "./layers/hazards";
import { deadSourceLabels, everySourceDead, freshnessOf } from "./freshness";
import type { LayerEvent, LayerFetchResult, PulseSnapshot } from "./types";

const NOW = "2026-07-30T12:00:00.000Z";
const layer = createHazardsLayer(fetch);

const ev = (id: string): LayerEvent => ({
  id, layer: "hazards", category: "wildfire", title: "Fire",
  lat: 1, lon: 2, date: NOW, severity: 0.9, source: "EONET",
});

const ok = (r: Omit<LayerFetchResult, "sources">): PromiseSettledResult<LayerFetchResult> =>
  ({
    status: "fulfilled",
    value: { ...r, sources: [{ id: "eonet", label: "EONET", live: true }] },
  });
const dead = (): PromiseSettledResult<LayerFetchResult> =>
  ({ status: "rejected", reason: new Error("down") });

/** The layer logs each dead feed; these tests assert behaviour, not console noise. */
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const real = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = real;
  }
};

const throwingFetch = (async () => {
  throw new Error("upstream unreachable");
}) as typeof fetch;

/** A fetch where only the named upstream answers; the other throws. */
const onlyFetch = (liveUrlPart: string, body: unknown): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    if (!String(input).includes(liveUrlPart)) throw new Error("upstream unreachable");
    return { ok: true, json: async () => body } as Response;
  }) as typeof fetch;

/** Drives the registered layer for real, exactly as getPulseSnapshot does. */
const snapshotFrom = async (fetchImpl: typeof fetch): Promise<PulseSnapshot> =>
  quiet(async () => {
    const real = createHazardsLayer(fetchImpl);
    const results = await Promise.allSettled([real.fetch()]);
    // The trap this contract exists for: the layer catches its own feed
    // failures, so it settles FULFILLED even when nothing answered.
    assert.equal(results[0].status, "fulfilled");
    return buildSnapshot([real], results, NOW);
  });

test("reports the assembly time and marks fresh data as not stale", () => {
  const snap = buildSnapshot([layer], [ok({ events: [ev("a")], unplottable: 0 })], NOW);
  assert.equal(snap.generatedAt, NOW);
  assert.equal(snap.stale, false);
});

test("carries the unplottable count through to the snapshot", () => {
  const snap = buildSnapshot([layer], [ok({ events: [ev("a")], unplottable: 3 })], NOW);
  assert.equal(snap.events.length, 1);
  assert.equal(snap.unplottable, 3);
});

test("marks a layer live when one of its sources reported live", () => {
  const snap = buildSnapshot([layer], [ok({ events: [ev("a")], unplottable: 0 })], NOW);
  assert.equal(snap.layers[0].live, true);
  assert.equal(snap.layers[0].id, "hazards");
});

test("marks a layer not live when its fetch rejected, without throwing", () => {
  const snap = buildSnapshot([layer], [dead()], NOW);
  assert.equal(snap.layers[0].live, false);
  assert.deepEqual(snap.layers[0].sources, []);
  assert.deepEqual(snap.events, []);
});

test("includes the layer's own index for the HUD", () => {
  const snap = buildSnapshot([layer], [ok({ events: [ev("a"), ev("b")], unplottable: 0 })], NOW);
  assert.ok(snap.layers[0].index);
  assert.ok((snap.layers[0].index?.score ?? -1) >= 0);
});

test("ships the category metadata so the UI never hardcodes colours", () => {
  const snap = buildSnapshot([layer], [ok({ events: [], unplottable: 0 })], NOW);
  assert.equal(snap.layers[0].categories.wildfire.color, "#E75D31");
});

test("concatenates layers rather than deduping across them", () => {
  // Same category key, same spot, same minute — but two different layers. A
  // cross-layer merge would collapse these into one; nothing here may.
  const a = { ...ev("a"), layer: "hazards" };
  const b = { ...ev("b"), layer: "unrest", source: "OTHER" };
  const snap = buildSnapshot(
    [layer, layer],
    [ok({ events: [a], unplottable: 0 }), ok({ events: [b], unplottable: 0 })],
    NOW
  );
  assert.deepEqual(snap.events.map((e) => e.id).sort(), ["a", "b"]);
});

test("orders the concatenated event list newest first", () => {
  const older = { ...ev("older"), date: "2026-07-28T00:00:00.000Z" };
  const newer = { ...ev("newer"), date: "2026-07-30T11:00:00.000Z" };
  const snap = buildSnapshot(
    [layer, layer],
    [ok({ events: [older], unplottable: 0 }), ok({ events: [newer], unplottable: 0 })],
    NOW
  );
  assert.deepEqual(snap.events.map((e) => e.id), ["newer", "older"]);
});

test("an all-dead snapshot is empty rather than fabricated", () => {
  const snap = buildSnapshot([layer], [dead()], NOW);
  assert.equal(snap.events.length, 0);
  assert.equal(snap.stale, false); // freshly fetched nothing — not stale data
});

// ---- the real path -------------------------------------------------------
// Every test above hands buildSnapshot a settled result by hand. Production
// cannot produce a rejected one, so those alone let a permanently-true `live`
// ship through review. These drive the registered layer through its own
// allSettled instead.

test("a total outage through the real layer is not live", async () => {
  const snap = await snapshotFrom(throwingFetch);
  assert.equal(snap.layers[0].live, false);
  assert.deepEqual(snap.layers[0].sources, [
    { id: "eonet", label: "EONET", live: false },
    { id: "usgs", label: "USGS", live: false },
  ]);
});

test("a total outage publishes no hazard index, fabricated Calm included", async () => {
  const snap = await snapshotFrom(throwingFetch);
  assert.equal(snap.layers[0].index, null);
  assert.equal(snap.events.length, 0);
  assert.equal(snap.unplottable, 0);
});

test("a total outage reads Snapshot, not Live, and names both dead feeds", async () => {
  const snap = await snapshotFrom(throwingFetch);
  assert.equal(everySourceDead(snap.layers), true);
  assert.deepEqual(freshnessOf(snap), { label: "Snapshot", live: false });
  assert.deepEqual(deadSourceLabels(snap.layers), ["EONET", "USGS"]);
});

const USGS_ONLY = {
  features: [{
    id: "us1",
    properties: {
      mag: 5.2, place: "Test Sea", time: Date.parse(NOW), url: "https://usgs.test/1",
    },
    geometry: { coordinates: [10, 20, 5] },
  }],
};

test("one dead feed still reads live, and names only the feed that died", async () => {
  const snap = await snapshotFrom(onlyFetch("usgs", USGS_ONLY));

  assert.equal(snap.layers[0].live, true);
  assert.deepEqual(deadSourceLabels(snap.layers), ["EONET"]);
  assert.equal(everySourceDead(snap.layers), false);
  assert.deepEqual(freshnessOf(snap), { label: "Live", live: true });
  // A partially live layer still scores what it did get.
  assert.ok(snap.layers[0].index);
  assert.equal(snap.events.length, 1);
});

// ---- last-good cache ------------------------------------------------------
// Unreachable until liveness became real: everySourceDead could never be true,
// so lastGood was written and never read.

test("a failing round after a good one serves the cached payload, labelled stale", async () => {
  __resetPulseCache();
  const good = createHazardsLayer(onlyFetch("usgs", USGS_ONLY));
  const first = await quiet(() => getPulseSnapshot([good]));
  assert.equal(first.stale, false);
  assert.equal(first.events.length, 1);

  const bad = createHazardsLayer(throwingFetch);
  const second = await quiet(() => getPulseSnapshot([bad]));
  assert.equal(second.stale, true);
  assert.equal(second.events.length, 1);        // the cached payload, not a blank globe
  assert.equal(freshnessOf(second).label, "Snapshot");
});

test("a failing round with no warm cache is honestly empty rather than cached", async () => {
  __resetPulseCache();
  const bad = createHazardsLayer(throwingFetch);
  const snap = await quiet(() => getPulseSnapshot([bad]));
  assert.equal(snap.stale, false);              // nothing was cached — nothing to be stale
  assert.equal(snap.layers[0].live, false);
  assert.equal(snap.layers[0].index, null);
  assert.equal(snap.events.length, 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createNewsLayer, NEWS_FRESH_DAYS } from "./news";
import type { EventsFile, RadarEvent } from "@/lib/radar/events";

const radarEvent = (over: Partial<RadarEvent>): RadarEvent => ({
  id: "r1",
  title: "Russian strikes on Kyiv kill at least nine",
  summary: "",
  location: "global",
  tone: -0.5,
  volume: 3,
  score: 0.8,
  sources: ["https://example.com/a"],
  surfaced_at: "2026-08-01T08:00:00Z",
  latest_seen: "2026-08-01T09:00:00Z",
  promoted: false,
  ...over,
});

const feed = (events: RadarEvent[], generatedAt = "2026-08-01T09:00:00Z"): EventsFile => ({
  generated_at: generatedAt,
  events,
});

const NOW = Date.parse("2026-08-01T12:00:00Z");

test("plots a geocodable headline as a news event at the named place", async () => {
  const layer = createNewsLayer(async () => feed([radarEvent({})]), () => NOW);
  const result = await layer.fetch();
  assert.equal(result.events.length, 1);
  const e = result.events[0];
  assert.equal(e.layer, "news");
  assert.equal(e.category, "headline");
  assert.ok(Math.abs(e.lat - 50.45) < 1);          // Kyiv
  assert.equal(e.source, "Radar");
  assert.equal(e.url, "https://example.com/a");
});

test("a london-tagged event pins to London without consulting the gazetteer", async () => {
  const layer = createNewsLayer(
    async () => feed([radarEvent({ location: "london", title: "No place named here" })]),
    () => NOW
  );
  const result = await layer.fetch();
  assert.equal(result.events.length, 1);
  assert.ok(Math.abs(result.events[0].lat - 51.5) < 0.2);
});

test("an ungeocodable global headline is counted unplottable, not dropped silently", async () => {
  const layer = createNewsLayer(
    async () => feed([radarEvent({ title: "Why crotchless pants are peak retail" })]),
    () => NOW
  );
  const result = await layer.fetch();
  assert.equal(result.events.length, 0);
  assert.equal(result.unplottable, 1);
});

test("severity clamps the radar score into 0..1 and is flagged as a baseline", async () => {
  const layer = createNewsLayer(async () => feed([radarEvent({ score: 3.7 })]), () => NOW);
  const result = await layer.fetch();
  assert.equal(result.events[0].severity, 1);
  // "category" per types.ts: not a physical measurement of the event, so the
  // UI must never print it as a severity reading.
  assert.equal(result.events[0].severityFrom, "category");
});

test("the source reports live while the feed is fresh, dead once it ages out", async () => {
  const fresh = createNewsLayer(async () => feed([], "2026-08-01T09:00:00Z"), () => NOW);
  assert.equal((await fresh.fetch()).sources[0].live, true);

  const staleMs = NOW - (NEWS_FRESH_DAYS + 1) * 86_400_000;
  const stale = createNewsLayer(
    async () => feed([], new Date(staleMs).toISOString()),
    () => NOW
  );
  assert.equal((await stale.fetch()).sources[0].live, false);
});

test("a headline older than the freshness window is not plotted even from a fresh file", async () => {
  const nineDaysAgo = new Date(NOW - 9 * 86_400_000).toISOString();
  const layer = createNewsLayer(
    async () =>
      feed(
        [
          radarEvent({ id: "old", latest_seen: nineDaysAgo }),
          radarEvent({ id: "new", latest_seen: "2026-08-01T09:00:00Z" }),
        ],
        "2026-08-01T09:00:00Z"
      ),
    () => NOW
  );
  const result = await layer.fetch();
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].id, "radar:new");
});

test("a headline with an unparseable latest_seen is dropped, not plotted as current", async () => {
  const layer = createNewsLayer(
    async () => feed([radarEvent({ latest_seen: "not-a-date" })]),
    () => NOW
  );
  const result = await layer.fetch();
  assert.equal(result.events.length, 0);
});

test("a feed that cannot be read reports a dead source and no events", async () => {
  const layer = createNewsLayer(
    async () => {
      throw new Error("boom");
    },
    () => NOW
  );
  const result = await layer.fetch();
  assert.equal(result.events.length, 0);
  assert.equal(result.sources[0].live, false);
});

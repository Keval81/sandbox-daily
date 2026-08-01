import { test } from "node:test";
import assert from "node:assert/strict";
import { getTickerHeadlines } from "./ticker";
import type { EventsFile } from "./events";

function feed(titles: string[]): EventsFile {
  return {
    generated_at: "2026-06-06T14:00:00Z",
    events: titles.map((title, i) => ({
      id: `e${i}`,
      title,
      summary: title,
      location: "global" as const,
      tone: 0,
      volume: 1,
      score: 1 - i * 0.1,
      sources: [],
      surfaced_at: "2026-06-06T14:00:00Z",
      latest_seen: "2026-06-06T14:00:00Z",
      promoted: false,
    })),
  };
}

test("returns the top-3 event titles in feed order", async () => {
  const read = async () => feed(["First", "Second", "Third", "Fourth"]);
  assert.deepEqual(await getTickerHeadlines(3, read), ["First", "Second", "Third"]);
});

test("respects a custom limit", async () => {
  const read = async () => feed(["A", "B", "C"]);
  assert.deepEqual(await getTickerHeadlines(2, read), ["A", "B"]);
});

test("drops blank titles", async () => {
  const read = async () => feed(["Real", "   ", "Also real"]);
  assert.deepEqual(await getTickerHeadlines(3, read), ["Real", "Also real"]);
});

test("falls back to the bundled radar snapshot when the live feed is empty", async () => {
  const read = async () => feed([]);
  const snapshot = () => feed(["Snapshot one", "Snapshot two"]);
  assert.deepEqual(await getTickerHeadlines(3, read, snapshot), ["Snapshot one", "Snapshot two"]);
});

test("prefers the live feed over the snapshot", async () => {
  const read = async () => feed(["Live"]);
  const snapshot = () => feed(["Snapshot"]);
  assert.deepEqual(await getTickerHeadlines(3, read, snapshot), ["Live"]);
});

test("returns an empty list when the live feed and the snapshot are both empty", async () => {
  const read = async () => feed([]);
  assert.deepEqual(await getTickerHeadlines(3, read, () => feed([])), []);
});

test("the default snapshot fallback carries real radar headlines", async () => {
  // Guards the bundled snapshot itself: an empty or malformed
  // events.snapshot.json would silently blank the production ticker.
  const read = async () => feed([]);
  const titles = await getTickerHeadlines(3, read);
  assert.ok(titles.length > 0);
  for (const t of titles) assert.equal(typeof t, "string");
});

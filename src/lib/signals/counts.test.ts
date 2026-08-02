import test from "node:test";
import assert from "node:assert/strict";
import { parseCounts, emptyCounts } from "./counts";

test("parseCounts maps PostgREST rows by slug", () => {
  const rows = [
    { slug: "a", likes: 3, views: 41 },
    { slug: "b", likes: 0, views: 7 },
  ];
  assert.deepEqual(parseCounts(rows), {
    a: { likes: 3, views: 41 },
    b: { likes: 0, views: 7 },
  });
});

test("parseCounts returns an empty map for an empty result", () => {
  assert.deepEqual(parseCounts([]), {});
});

test("parseCounts ignores rows it cannot read rather than throwing", () => {
  const rows = [{ slug: "a", likes: 2, views: 5 }, { nope: true }, null, "x"];
  assert.deepEqual(parseCounts(rows), { a: { likes: 2, views: 5 } });
});

test("parseCounts survives a body that is not an array of rows", () => {
  assert.deepEqual(parseCounts({ message: "JWT expired" }), {});
  assert.deepEqual(parseCounts(null), {});
  assert.deepEqual(parseCounts(undefined), {});
});

test("parseCounts coerces bigint counts arriving as strings", () => {
  assert.deepEqual(parseCounts([{ slug: "a", likes: "12", views: "300" }]), {
    a: { likes: 12, views: 300 },
  });
});

test("parseCounts drops a row whose count is not a number", () => {
  assert.deepEqual(parseCounts([{ slug: "a", likes: "many", views: 3 }]), {});
});

test("emptyCounts gives every requested slug a zero pair", () => {
  assert.deepEqual(emptyCounts(["a", "b"]), {
    a: { likes: 0, views: 0 },
    b: { likes: 0, views: 0 },
  });
  assert.deepEqual(emptyCounts([]), {});
});

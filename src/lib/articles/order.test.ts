import test from "node:test";
import assert from "node:assert/strict";
import { byRecency } from "./order";
import type { Article } from "@/lib/types";

const article = (slug: string, date: string, editedAt?: string): Article =>
  ({ slug, date, editedAt, title: slug, category: "news", status: "published" }) as unknown as Article;

test("a later publication date always wins, whatever the edit stamps say", () => {
  const older = article("older", "2026-08-01T00:00:00.000Z", "2026-08-02T23:00:00.000Z");
  const newer = article("newer", "2026-08-02T00:00:00.000Z", "2026-08-02T09:00:00.000Z");
  assert.deepEqual([older, newer].sort(byRecency).map((a) => a.slug), ["newer", "older"]);
});

test("same-day stories break the tie on when they were finished", () => {
  // The pipeline stamps date-only at midnight, so every story published on one
  // day is tied to the millisecond — this is the whole reason the tie-break
  // exists, and without it the lead was decided by readdir order.
  const noon = article("noon", "2026-08-02T00:00:00.000Z", "2026-08-02T12:28:55.749Z");
  const evening = article("evening", "2026-08-02T00:00:00.000Z", "2026-08-02T16:13:11.354Z");
  assert.deepEqual([noon, evening].sort(byRecency).map((a) => a.slug), ["evening", "noon"]);
});

test("a story with no edit stamp sorts after same-day stories that have one", () => {
  const stamped = article("stamped", "2026-08-02T00:00:00.000Z", "2026-08-02T09:00:00.000Z");
  const bare = article("bare", "2026-08-02T00:00:00.000Z");
  assert.deepEqual([bare, stamped].sort(byRecency).map((a) => a.slug), ["stamped", "bare"]);
});

test("an unparseable edit stamp is ignored rather than poisoning the order", () => {
  const good = article("good", "2026-08-02T00:00:00.000Z", "2026-08-02T09:00:00.000Z");
  const junk = article("junk", "2026-08-02T00:00:00.000Z", "not a date");
  assert.deepEqual([junk, good].sort(byRecency).map((a) => a.slug), ["good", "junk"]);
});

test("the comparator is symmetric, so sort order cannot depend on input order", () => {
  const a = article("a", "2026-08-02T00:00:00.000Z", "2026-08-02T16:00:00.000Z");
  const b = article("b", "2026-08-02T00:00:00.000Z", "2026-08-02T12:00:00.000Z");
  assert.ok(byRecency(a, b) < 0 && byRecency(b, a) > 0);
  assert.equal(byRecency(a, a), 0);
});

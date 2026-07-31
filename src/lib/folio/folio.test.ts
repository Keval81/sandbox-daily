import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveFolio } from "./folio";

// 2026-07-31T13:22:00Z = 2026-07-31 14:22 in Europe/London (BST, UTC+1).
// Verified independently (doomsday algorithm + Intl.DateTimeFormat, both
// cross-checked): 2026-07-31 is a FRIDAY, not the "THURSDAY" the brief's
// copy example used — the format is copied verbatim, the weekday is not,
// per the brief's own instruction to verify date arithmetic rather than
// trust a possibly-wrong worked example.
const JULY_EPOCH_MS = Date.UTC(2026, 6, 31, 13, 22, 0);

test("dateLine is uppercase, en-GB order (weekday day month year), no commas", () => {
  const { dateLine } = deriveFolio(JULY_EPOCH_MS, null);
  assert.equal(dateLine, "FRIDAY 31 JULY 2026");
});

test("clock is 24h HH:MM, London local time", () => {
  const { clock } = deriveFolio(JULY_EPOCH_MS, null);
  assert.equal(clock, "14:22");
});

test("dateLine/clock stay London time even when the host process's ambient TZ differs (TZ-proof)", () => {
  // If Europe/London were ever dropped from the Intl.DateTimeFormat calls,
  // this is what would go wrong: the formatter would fall back to whatever
  // TZ the process happens to be running under, and BST's +1h offset (and
  // potentially the calendar date itself, near local midnight) would be lost
  // silently. Forcing the ambient TZ to America/New_York (UTC-4 in July) and
  // asserting the London values still come out is what makes that failure
  // mode a red test instead of an invisible bug — same motivation as the
  // GDACS asUtc fix in src/lib/pulse/normalise-gdacs.ts, applied to display
  // formatting instead of feed parsing.
  const original = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const folio = deriveFolio(JULY_EPOCH_MS, null);
    assert.equal(folio.clock, "14:22", "clock must read London time, not America/New_York's 09:22");
    assert.equal(folio.dateLine, "FRIDAY 31 JULY 2026");
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("a single-digit London day of month is not zero-padded (newspaper convention)", () => {
  const { dateLine } = deriveFolio(Date.UTC(2026, 6, 5, 13, 22, 0), null);
  assert.equal(dateLine, "SUNDAY 5 JULY 2026");
});

test("midnight in London formats as 00:00, not 24:00", () => {
  const { clock } = deriveFolio(Date.UTC(2026, 0, 1, 0, 0, 0), null);
  assert.equal(clock, "00:00");
});

test("edition 1 is 2026-01-01, day one of the count", () => {
  const { edition } = deriveFolio(Date.UTC(2026, 0, 1, 12, 0, 0), null);
  assert.equal(edition, 1);
});

test("edition on 2026-07-31 is 212 (31+28+31+30+31+30+31 days since Jan 1, inclusive)", () => {
  const { edition } = deriveFolio(JULY_EPOCH_MS, null);
  assert.equal(edition, 212);
});

test("edition counts on the UTC calendar day, not London's — no BST double-count or skip", () => {
  // 2026-07-30 23:30 UTC is already 2026-07-31 00:30 in London (BST), but
  // the edition is spec'd as UTC-day-based, so it must still read as day 211
  // (2026-07-30), not 212 — a deliberate split from dateLine/clock, which
  // are London-local.
  const { edition } = deriveFolio(Date.UTC(2026, 6, 30, 23, 30, 0), null);
  assert.equal(edition, 211);
});

test("tempC passes through a present weather reading", () => {
  const { tempC } = deriveFolio(JULY_EPOCH_MS, { tempC: 21, fetchedAt: "2026-07-31T13:00:00.000Z" });
  assert.equal(tempC, 21);
});

test("tempC of exactly 0 is not clobbered to null", () => {
  const { tempC } = deriveFolio(JULY_EPOCH_MS, { tempC: 0, fetchedAt: "2026-07-31T13:00:00.000Z" });
  assert.equal(tempC, 0);
});

test("tempC is null when weather is null (segment omitted, never fabricated)", () => {
  const { tempC } = deriveFolio(JULY_EPOCH_MS, null);
  assert.equal(tempC, null);
});

test("dateLine follows London's calendar day, not UTC's, past London midnight (carried from Task 2 review)", () => {
  // 2026-07-30T23:30:00Z is already 2026-07-31 00:30 in Europe/London (BST,
  // UTC+1) — half an hour into the next London day while UTC's calendar
  // date is still the 30th. dateLine/clock are spec'd as London-local (see
  // the TZ-proof test above), so dateLine must read the 31st here — a
  // deliberate split from `edition`, which stays on the UTC calendar day on
  // purpose (see the test directly above this one, same epoch, asserting
  // edition 211, not 212).
  const { dateLine } = deriveFolio(Date.UTC(2026, 6, 30, 23, 30, 0), null);
  assert.equal(dateLine, "FRIDAY 31 JULY 2026");
});

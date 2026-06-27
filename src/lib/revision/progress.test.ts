// src/lib/revision/progress.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRevisionProgress,
  REVISION_SLOW_AFTER_MS,
  REVISION_HARD_TIMEOUT_MS,
} from "./progress";

test("is active before the slow threshold", () => {
  assert.equal(classifyRevisionProgress(0), "active");
  assert.equal(classifyRevisionProgress(REVISION_SLOW_AFTER_MS - 1), "active");
});

test("is slow between the slow threshold and the hard timeout", () => {
  assert.equal(classifyRevisionProgress(REVISION_SLOW_AFTER_MS), "slow");
  assert.equal(classifyRevisionProgress(REVISION_HARD_TIMEOUT_MS - 1), "slow");
});

test("is stuck only at or beyond the hard timeout", () => {
  assert.equal(classifyRevisionProgress(REVISION_HARD_TIMEOUT_MS), "stuck");
  assert.equal(classifyRevisionProgress(REVISION_HARD_TIMEOUT_MS + 60_000), "stuck");
});

test("a 10-minute retry cycle is still slow, not stuck (the old 5-min cutoff bug)", () => {
  assert.equal(classifyRevisionProgress(10 * 60_000), "slow");
});

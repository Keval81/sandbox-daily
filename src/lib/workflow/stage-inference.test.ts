import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAvailableActions,
  inferHealth,
  inferStoryType,
  normalizeVertical,
} from "./stage-inference";

test("inferStoryType distinguishes normal, feature, and spotlight", () => {
  assert.equal(
    inferStoryType({ sourceRootKind: "research", filename: "x.md" }),
    "normal"
  );
  assert.equal(
    inferStoryType({ sourceRootKind: "feature-research", filename: "x.md" }),
    "feature"
  );
  assert.equal(
    inferStoryType({
      sourceRootKind: "feature-research",
      filename: "2026-05-01-nikola-tesla-deep-spotlight-profile-research.md",
      featureType: null,
    }),
    "spotlight"
  );
  assert.equal(
    inferStoryType({
      sourceRootKind: "feature-research",
      filename: "x.md",
      featureType: "spotlight",
    }),
    "spotlight"
  );
});

test("normalizeVertical maps pipeline categories to dashboard verticals", () => {
  assert.equal(normalizeVertical("sports"), "sport");
  assert.equal(normalizeVertical("sport"), "sport");
  assert.equal(normalizeVertical("features"), "features");
  assert.equal(normalizeVertical("spotlights"), "spotlights");
  assert.equal(normalizeVertical(null), "unknown");
});

test("inferHealth escalates errors above stale warnings", () => {
  assert.equal(inferHealth({ latestError: "failed", isStale: true }), "error");
  assert.equal(inferHealth({ latestError: null, isStale: true }), "stale");
  assert.equal(
    inferHealth({ latestError: null, isStale: false, hasWarning: true }),
    "warning"
  );
  assert.equal(inferHealth({ latestError: null, isStale: false }), "ok");
});

test("buildAvailableActions exposes only safe actions for each story state", () => {
  assert.deepEqual(
    buildAvailableActions({
      sourcePath: "/tmp/research.md",
      reviewPath: null,
      logPath: null,
      canRetry: false,
      canMoveToSocialReady: false,
    }),
    ["open-source"]
  );
  assert.deepEqual(
    buildAvailableActions({
      sourcePath: "/tmp/research.md",
      reviewPath: "/review/sport/story",
      logPath: "/tmp/job.log",
      canRetry: true,
      canMoveToSocialReady: true,
    }),
    [
      "open-source",
      "open-review",
      "open-logs",
      "retry-failed-job",
      "move-to-social-ready",
    ]
  );
  assert.deepEqual(
    buildAvailableActions({
      sourcePath: "/tmp/research.md",
      reviewPath: null,
      logPath: null,
      canRetry: false,
      canMoveToSocialReady: false,
      canArchive: true,
    }),
    ["open-source", "archive-story"]
  );
});

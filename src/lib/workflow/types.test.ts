import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isWorkflowAction,
  WORKFLOW_ACTIONS,
  WORKFLOW_STAGES,
  WORKFLOW_TYPES,
} from "./types";

test("workflow constants expose the supported MVP stages, story types, and actions", () => {
  assert.deepEqual(WORKFLOW_TYPES, ["normal", "feature", "spotlight"]);
  assert.deepEqual(WORKFLOW_STAGES, [
    "research",
    "writer",
    "editor",
    "ready-image",
    "image-agent",
    "human-review",
    "revision",
    "published",
  ]);
  assert.deepEqual(WORKFLOW_ACTIONS, [
    "open-source",
    "open-review",
    "open-logs",
    "retry-failed-job",
    "move-to-social-ready",
    "archive-story",
  ]);
});

test("isWorkflowAction accepts only supported action identifiers", () => {
  assert.equal(isWorkflowAction("open-source"), true);
  assert.equal(isWorkflowAction("move-to-social-ready"), true);
  assert.equal(isWorkflowAction("archive-story"), true);
  assert.equal(isWorkflowAction("run-writer-agent"), false);
  assert.equal(isWorkflowAction(null), false);
});

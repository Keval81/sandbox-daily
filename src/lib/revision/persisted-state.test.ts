import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPersistedRevisionState } from "./persisted-state";
import { retryPersistedReviewRequest } from "./jobs";
import { PersistedRevisionNoticeContent } from "@/app/review/[vertical]/[slug]/PersistedRevisionNotice";
import type { JobRecord, ReviewRequest } from "./types";

const REVIEW_REQUEST: ReviewRequest = {
  slug: "failed-piece",
  vertical: "sport",
  round: 1,
  submitted_at: "2026-05-14T10:00:00.000Z",
  overall_notes: "Tighten the ending.",
  inline_comments: [],
  image: { regenerate: false, context: null },
};

const FAILED_JOB: JobRecord = {
  id: "job-old",
  slug: "failed-piece",
  vertical: "sport",
  status: "error",
  current_step: "validating",
  started_at: "2026-05-14T10:01:00.000Z",
  updated_at: "2026-05-14T10:02:00.000Z",
  error: "Output failed validation: missing H1",
  log_path: "/tmp/job-old.log",
};

test("loads a failed revision job so the article page can show it after reload", async () => {
  const dir = await mkdtemp(join(tmpdir(), "revision-state-"));
  try {
    const jobsRoot = join(dir, "review-jobs");
    const requestsRoot = join(dir, "review-requests");
    await mkdir(jobsRoot, { recursive: true });
    await writeFile(join(jobsRoot, "job-old.json"), JSON.stringify(FAILED_JOB), "utf-8");
    await mkdir(join(requestsRoot, "sport"), { recursive: true });
    await writeFile(
      join(requestsRoot, "sport", "failed-piece.review-request.json"),
      JSON.stringify(REVIEW_REQUEST),
      "utf-8"
    );

    const state = await getPersistedRevisionState({
      status: "revision-requested",
      vertical: "sport",
      slug: "failed-piece",
      jobsRoot,
      requestsRoot,
    });

    assert.equal(state.job?.status, "error");
    assert.equal(state.lastError, "Output failed validation: missing H1");
    assert.equal(state.canRetry, true);

    const html = renderToStaticMarkup(
      React.createElement(PersistedRevisionNoticeContent, {
        state,
        interactive: true,
        retrying: false,
        error: null,
        onRetry: () => undefined,
      })
    );
    assert.match(html, /Revision job failed/);
    assert.match(html, /Output failed validation: missing H1/);
    assert.match(html, /Retry/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("retry reuses the persisted review request and spawns a fresh job", async () => {
  const dir = await mkdtemp(join(tmpdir(), "revision-retry-"));
  try {
    const jobsRoot = join(dir, "review-jobs");
    const requestsRoot = join(dir, "review-requests");
    await mkdir(join(requestsRoot, "sport"), { recursive: true });
    await writeFile(
      join(requestsRoot, "sport", "failed-piece.review-request.json"),
      JSON.stringify(REVIEW_REQUEST),
      "utf-8"
    );

    const spawned: Array<{ jobId: string; slug: string; vertical: string }> = [];
    const result = await retryPersistedReviewRequest({
      vertical: "sport",
      slug: "failed-piece",
      jobsRoot,
      requestsRoot,
      spawn: (input) => {
        spawned.push({
          jobId: input.jobId,
          slug: input.slug,
          vertical: input.vertical,
        });
      },
    });

    assert.equal(result.status, "queued");
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0]?.slug, "failed-piece");
    assert.equal(spawned[0]?.vertical, "sport");

    const rawRequest = await readFile(
      join(requestsRoot, "sport", "failed-piece.review-request.json"),
      "utf-8"
    );
    assert.deepEqual(JSON.parse(rawRequest), REVIEW_REQUEST);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

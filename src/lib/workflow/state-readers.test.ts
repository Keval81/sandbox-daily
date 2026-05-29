import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJsonFile, readReviewJobs } from "./state-readers";

test("readJsonFile returns data for valid JSON and a warning for malformed JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-json-"));
  try {
    const validPath = join(dir, "valid.json");
    const invalidPath = join(dir, "invalid.json");
    await writeFile(validPath, JSON.stringify({ ok: true }), "utf-8");
    await writeFile(invalidPath, "{ nope", "utf-8");

    const valid = await readJsonFile<{ ok: boolean }>(validPath);
    const invalid = await readJsonFile(invalidPath);

    assert.deepEqual(valid.data, { ok: true });
    assert.equal(valid.warning, null);
    assert.equal(invalid.data, null);
    assert.match(invalid.warning ?? "", /Malformed JSON/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readReviewJobs loads valid job records and warns on malformed records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-jobs-"));
  try {
    const jobsRoot = join(dir, "review-jobs");
    await mkdir(jobsRoot, { recursive: true });
    await writeFile(
      join(jobsRoot, "job-1.json"),
      JSON.stringify({
        id: "job-1",
        slug: "story",
        vertical: "sport",
        status: "error",
        current_step: "validating",
        started_at: "2026-05-16T10:00:00.000Z",
        updated_at: "2026-05-16T10:01:00.000Z",
        error: "Failed validation",
        log_path: "/tmp/job-1.log",
      }),
      "utf-8"
    );
    await writeFile(join(jobsRoot, "broken.json"), "{ nope", "utf-8");

    const result = await readReviewJobs(jobsRoot);

    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0]?.slug, "story");
    assert.equal(result.warnings.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

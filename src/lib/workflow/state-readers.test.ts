import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readEditorialSkips,
  readJsonFile,
  readReviewJobs,
} from "./state-readers";

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

const writeArticlesState = async (
  articlesRoot: string,
  processed: Record<string, unknown>
) => {
  await mkdir(articlesRoot, { recursive: true });
  await writeFile(
    join(articlesRoot, "articles-state.json"),
    JSON.stringify({ processed }, null, 2),
    "utf-8"
  );
};

test("readEditorialSkips returns the docs the writer's editorial gate declined", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-skips-"));
  try {
    await writeArticlesState(join(dir, "articles"), {
      "2026-08-03-semenyo.md": {
        processed_at: "2026-08-03T10:12:46.421Z",
        editorial_decision: "skip",
        skip_reason: "Classic football filler.",
      },
    });

    const result = await readEditorialSkips(join(dir, "articles"));

    assert.equal(result.skips.size, 1);
    assert.equal(
      result.skips.get("2026-08-03-semenyo.md")?.reason,
      "Classic football filler."
    );
    assert.equal(
      result.skips.get("2026-08-03-semenyo.md")?.skippedAt,
      "2026-08-03T10:12:46.421Z"
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readEditorialSkips ignores written docs and transient errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-skips-"));
  try {
    await writeArticlesState(join(dir, "articles"), {
      "written.md": {
        article: "2026-08-03-written.md",
        processed_at: "2026-08-03T09:00:00.000Z",
        editorial_decision: "write",
        format: "short-form",
      },
      // A retryable failure is not an editorial decision — the next pipeline
      // run picks it up again, so calling it "spiked" would be a lie.
      "errored.md": {
        processed_at: "2026-08-03T09:30:00.000Z",
        editorial_decision: "error",
        error: "Claude CLI failed: exit code 1",
        retry_count: 1,
      },
    });

    const result = await readEditorialSkips(join(dir, "articles"));

    assert.equal(result.skips.size, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readEditorialSkips falls back to a stated reason when the gate recorded none", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-skips-"));
  try {
    await writeArticlesState(join(dir, "articles"), {
      "bare.md": {
        processed_at: "2026-08-03T10:00:00.000Z",
        editorial_decision: "skip",
      },
    });

    const result = await readEditorialSkips(join(dir, "articles"));

    assert.match(
      result.skips.get("bare.md")?.reason ?? "",
      /below the editorial threshold/i
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readEditorialSkips is silent when the state file does not exist yet", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-skips-"));
  try {
    const result = await readEditorialSkips(join(dir, "articles"));

    assert.equal(result.skips.size, 0);
    assert.equal(result.warnings.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readEditorialSkips warns rather than throws when the state file is malformed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-skips-"));
  try {
    const articlesRoot = join(dir, "articles");
    await mkdir(articlesRoot, { recursive: true });
    await writeFile(join(articlesRoot, "articles-state.json"), "{ nope", "utf-8");

    const result = await readEditorialSkips(articlesRoot);

    assert.equal(result.skips.size, 0);
    assert.match(result.warnings[0] ?? "", /Malformed JSON/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

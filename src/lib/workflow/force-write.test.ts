import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildForceWriteCommand,
  readForceWriteJobs,
  resolveResearchDoc,
} from "./force-write";

const buildOutputs = async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-force-"));
  const outputsRoot = join(dir, "ssnn-outputs");
  await mkdir(join(outputsRoot, "research-docs"), { recursive: true });
  await mkdir(join(outputsRoot, "research-docs-features"), { recursive: true });
  return { dir, outputsRoot };
};

test("resolveResearchDoc finds a doc in the news research folder", async () => {
  const { dir, outputsRoot } = await buildOutputs();
  try {
    await writeFile(join(outputsRoot, "research-docs", "2026-08-03-a.md"), "x");

    const resolved = await resolveResearchDoc(outputsRoot, "2026-08-03-a.md");

    assert.equal(resolved, join(outputsRoot, "research-docs", "2026-08-03-a.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolveResearchDoc finds a doc in the features research folder", async () => {
  const { dir, outputsRoot } = await buildOutputs();
  try {
    await writeFile(
      join(outputsRoot, "research-docs-features", "2026-08-03-spotlight.md"),
      "x"
    );

    const resolved = await resolveResearchDoc(outputsRoot, "2026-08-03-spotlight.md");

    assert.ok(resolved?.endsWith("research-docs-features/2026-08-03-spotlight.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolveResearchDoc rejects a path instead of a filename", async () => {
  const { dir, outputsRoot } = await buildOutputs();
  try {
    // The value reaches a shell command. A doc name is a doc name.
    await assert.rejects(
      resolveResearchDoc(outputsRoot, "../../../etc/passwd"),
      /filename/i
    );
    await assert.rejects(
      resolveResearchDoc(outputsRoot, "research-docs/2026-08-03-a.md"),
      /filename/i
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolveResearchDoc rejects anything that is not markdown", async () => {
  const { dir, outputsRoot } = await buildOutputs();
  try {
    await assert.rejects(resolveResearchDoc(outputsRoot, "run-pipeline.sh"), /markdown/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolveResearchDoc returns null when the doc is simply gone", async () => {
  const { dir, outputsRoot } = await buildOutputs();
  try {
    assert.equal(await resolveResearchDoc(outputsRoot, "2026-08-03-missing.md"), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildForceWriteCommand runs the pipeline wrapper, not the writer directly", () => {
  const command = buildForceWriteCommand("/outputs", "2026-08-03-a.md");

  assert.equal(command.command, "/bin/bash");
  // Through run-pipeline.sh so the run takes the singleton lock and cannot race
  // the loop's writer stage on articles-state.json.
  assert.deepEqual(command.args, [
    "/outputs/force-write.sh",
    "2026-08-03-a.md",
  ]);
  assert.equal(command.cwd, "/outputs");
});

test("readForceWriteJobs reports a running job for the doc it belongs to", async () => {
  const { dir, outputsRoot } = await buildOutputs();
  try {
    const jobsRoot = join(outputsRoot, "force-write-jobs");
    await mkdir(jobsRoot, { recursive: true });
    await writeFile(
      join(jobsRoot, "2026-08-03-a.json"),
      JSON.stringify({
        filename: "2026-08-03-a.md",
        status: "running",
        startedAt: "2026-08-03T12:00:00.000Z",
        logPath: "/outputs/force-write-logs/2026-08-03-a.log",
      }),
      "utf-8"
    );

    const result = await readForceWriteJobs(jobsRoot);

    assert.equal(result.jobs.get("2026-08-03-a.md")?.status, "running");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readForceWriteJobs surfaces a run that could not take the pipeline lock", async () => {
  const { dir, outputsRoot } = await buildOutputs();
  try {
    const jobsRoot = join(outputsRoot, "force-write-jobs");
    await mkdir(jobsRoot, { recursive: true });
    await writeFile(
      join(jobsRoot, "2026-08-03-a.json"),
      JSON.stringify({
        filename: "2026-08-03-a.md",
        status: "busy",
        startedAt: "2026-08-03T12:00:00.000Z",
        finishedAt: "2026-08-03T12:00:01.000Z",
        logPath: "/outputs/force-write-logs/2026-08-03-a.log",
      }),
      "utf-8"
    );

    const result = await readForceWriteJobs(jobsRoot);

    assert.equal(result.jobs.get("2026-08-03-a.md")?.status, "busy");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readForceWriteJobs is silent when no override has ever run", async () => {
  const { dir, outputsRoot } = await buildOutputs();
  try {
    const result = await readForceWriteJobs(join(outputsRoot, "force-write-jobs"));

    assert.equal(result.jobs.size, 0);
    assert.equal(result.warnings.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readForceWriteJobs warns rather than throws on a malformed job file", async () => {
  const { dir, outputsRoot } = await buildOutputs();
  try {
    const jobsRoot = join(outputsRoot, "force-write-jobs");
    await mkdir(jobsRoot, { recursive: true });
    await writeFile(join(jobsRoot, "broken.json"), "{ nope", "utf-8");

    const result = await readForceWriteJobs(jobsRoot);

    assert.equal(result.jobs.size, 0);
    assert.equal(result.warnings.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// src/lib/revision/jobs.ts
import fs from "node:fs/promises";
import { openSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { REVIEW_JOBS_ROOT, REVISER_AGENT_PATH } from "./paths";
import type { JobRecord, ReviewRequest } from "./types";

export async function readJob(jobId: string): Promise<JobRecord | null> {
  try {
    const raw = await fs.readFile(path.join(REVIEW_JOBS_ROOT, `${jobId}.json`), "utf-8");
    return JSON.parse(raw) as JobRecord;
  } catch {
    return null;
  }
}

export async function findActiveJobFor(vertical: ReviewRequest["vertical"], slug: string): Promise<JobRecord | null> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(REVIEW_JOBS_ROOT);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(REVIEW_JOBS_ROOT, entry), "utf-8");
      const job = JSON.parse(raw) as JobRecord;
      if (
        job.vertical === vertical &&
        job.slug === slug &&
        (job.status === "queued" || job.status === "running")
      ) {
        return job;
      }
    } catch {
      // ignore malformed records
    }
  }
  return null;
}

export interface CreateJobInput {
  slug: string;
  vertical: ReviewRequest["vertical"];
}

export interface CreatedJob {
  jobId: string;
  logPath: string;
  recordPath: string;
}

export async function createJobRecord(input: CreateJobInput): Promise<CreatedJob> {
  await fs.mkdir(REVIEW_JOBS_ROOT, { recursive: true });
  const jobId = randomUUID();
  const recordPath = path.join(REVIEW_JOBS_ROOT, `${jobId}.json`);
  const logPath = path.join(REVIEW_JOBS_ROOT, `${jobId}.log`);
  const now = new Date().toISOString();
  const record: JobRecord = {
    id: jobId,
    slug: input.slug,
    vertical: input.vertical,
    status: "queued",
    current_step: "queued",
    started_at: now,
    updated_at: now,
    error: null,
    log_path: logPath,
  };
  await fs.writeFile(recordPath, JSON.stringify(record, null, 2), "utf-8");
  return { jobId, logPath, recordPath };
}

export interface SpawnReviserInput {
  jobId: string;
  slug: string;
  vertical: ReviewRequest["vertical"];
  logPath: string;
}

export function spawnReviser(input: SpawnReviserInput): void {
  const logFd = openSync(input.logPath, "a");
  const child = spawn(
    "npm",
    ["start", "--", "--slug", input.slug, "--vertical", input.vertical, "--job-id", input.jobId],
    {
      cwd: REVISER_AGENT_PATH,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:${process.env.PATH ?? ""}`,
      },
    }
  );
  child.unref();
}

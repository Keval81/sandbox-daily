// src/lib/revision/jobs.ts
import fs from "node:fs/promises";
import { openSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { REVIEW_JOBS_ROOT, REVIEW_REQUESTS_ROOT, REVISER_AGENT_PATH } from "./paths";
import type { JobRecord, ReviewRequest } from "./types";

export async function readJob(jobId: string, jobsRoot = REVIEW_JOBS_ROOT): Promise<JobRecord | null> {
  try {
    const raw = await fs.readFile(path.join(jobsRoot, `${jobId}.json`), "utf-8");
    return JSON.parse(raw) as JobRecord;
  } catch {
    return null;
  }
}

export async function findActiveJobFor(
  vertical: ReviewRequest["vertical"],
  slug: string,
  jobsRoot = REVIEW_JOBS_ROOT
): Promise<JobRecord | null> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(jobsRoot);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(jobsRoot, entry), "utf-8");
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

export async function findLatestJobFor(
  vertical: ReviewRequest["vertical"],
  slug: string,
  jobsRoot = REVIEW_JOBS_ROOT
): Promise<JobRecord | null> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(jobsRoot);
  } catch {
    return null;
  }

  const jobs: JobRecord[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(jobsRoot, entry), "utf-8");
      const job = JSON.parse(raw) as JobRecord;
      if (job.vertical === vertical && job.slug === slug) {
        jobs.push(job);
      }
    } catch {
      // ignore malformed records
    }
  }

  jobs.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  return jobs[0] ?? null;
}

export async function readReviewRequestFor(
  vertical: ReviewRequest["vertical"],
  slug: string,
  requestsRoot = REVIEW_REQUESTS_ROOT
): Promise<ReviewRequest | null> {
  try {
    const raw = await fs.readFile(
      path.join(requestsRoot, vertical, `${slug}.review-request.json`),
      "utf-8"
    );
    return JSON.parse(raw) as ReviewRequest;
  } catch {
    return null;
  }
}

export interface CreateJobInput {
  slug: string;
  vertical: ReviewRequest["vertical"];
  jobsRoot?: string;
}

export interface CreatedJob {
  jobId: string;
  logPath: string;
  recordPath: string;
}

export async function createJobRecord(input: CreateJobInput): Promise<CreatedJob> {
  const jobsRoot = input.jobsRoot ?? REVIEW_JOBS_ROOT;
  await fs.mkdir(jobsRoot, { recursive: true });
  const jobId = randomUUID();
  const recordPath = path.join(jobsRoot, `${jobId}.json`);
  const logPath = path.join(jobsRoot, `${jobId}.log`);
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

export interface RetryPersistedReviewRequestInput {
  slug: string;
  vertical: ReviewRequest["vertical"];
  jobsRoot?: string;
  requestsRoot?: string;
  spawn?: (input: SpawnReviserInput) => void;
}

export interface RetriedRevisionJob {
  jobId: string;
  status: "queued";
}

export async function retryPersistedReviewRequest(
  input: RetryPersistedReviewRequestInput
): Promise<RetriedRevisionJob> {
  const request = await readReviewRequestFor(
    input.vertical,
    input.slug,
    input.requestsRoot
  );
  if (!request) {
    throw new Error(`Review request not found for ${input.vertical}/${input.slug}`);
  }

  const active = await findActiveJobFor(input.vertical, input.slug, input.jobsRoot);
  if (active) {
    throw new Error("Article is already in revision.");
  }

  const job = await createJobRecord({
    slug: request.slug,
    vertical: request.vertical,
    jobsRoot: input.jobsRoot,
  });
  const spawn = input.spawn ?? spawnReviser;
  spawn({
    jobId: job.jobId,
    slug: request.slug,
    vertical: request.vertical,
    logPath: job.logPath,
  });
  return { jobId: job.jobId, status: "queued" };
}

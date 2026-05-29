import fs from "node:fs/promises";
import path from "node:path";
import type { JobRecord } from "@/lib/revision/types";

export interface JsonReadResult<T> {
  data: T | null;
  warning: string | null;
}

export async function readJsonFile<T = unknown>(
  filePath: string
): Promise<JsonReadResult<T>> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return { data: JSON.parse(raw) as T, warning: null };
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? error.code
        : null;
    if (code === "ENOENT") return { data: null, warning: null };
    const message =
      error instanceof SyntaxError ? "Malformed JSON" : "Failed to read JSON";
    return { data: null, warning: `${message}: ${filePath}` };
  }
}

export interface ReviewJobsReadResult {
  jobs: JobRecord[];
  warnings: string[];
}

function isJobRecord(value: unknown): value is JobRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<JobRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.slug === "string" &&
    typeof record.vertical === "string" &&
    (record.status === "queued" ||
      record.status === "running" ||
      record.status === "done" ||
      record.status === "error") &&
    typeof record.updated_at === "string" &&
    typeof record.log_path === "string"
  );
}

export async function readReviewJobs(
  jobsRoot: string
): Promise<ReviewJobsReadResult> {
  const warnings: string[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(jobsRoot);
  } catch {
    return {
      jobs: [],
      warnings: [`Review jobs folder not found: ${jobsRoot}`],
    };
  }

  const jobs: JobRecord[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const filePath = path.join(jobsRoot, entry);
    const result = await readJsonFile<JobRecord>(filePath);
    if (result.warning) {
      warnings.push(result.warning);
      continue;
    }
    if (!isJobRecord(result.data)) {
      warnings.push(`Invalid review job shape: ${filePath}`);
      continue;
    }
    jobs.push(result.data);
  }

  return { jobs, warnings };
}

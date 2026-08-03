import fs from "node:fs/promises";
import path from "node:path";
import { readJsonFile } from "./state-readers";

export const FORCE_WRITE_STATUSES = ["running", "done", "failed", "busy"] as const;
export type ForceWriteStatus = (typeof FORCE_WRITE_STATUSES)[number];

export interface ForceWriteJob {
  filename: string;
  status: ForceWriteStatus;
  startedAt: string;
  finishedAt?: string;
  logPath: string;
}

export interface ForceWriteJobsReadResult {
  jobs: Map<string, ForceWriteJob>;
  warnings: string[];
}

export interface ForceWriteCommand {
  command: string;
  args: string[];
  cwd: string;
}

/**
 * Resolves a research doc by filename, or explains why it can't.
 *
 * The value arrives from a form and ends up in a shell command, so it must be a
 * bare markdown filename living in one of the two research folders — never a
 * path, never a traversal, never a shell script sitting next to them.
 */
export async function resolveResearchDoc(
  outputsRoot: string,
  filename: string
): Promise<string | null> {
  if (!filename || filename !== path.basename(filename)) {
    throw new Error(`Expected a research doc filename, got: ${filename}`);
  }
  if (!filename.endsWith(".md")) {
    throw new Error(`Research docs are markdown; got: ${filename}`);
  }

  for (const folder of ["research-docs", "research-docs-features"]) {
    const candidate = path.join(outputsRoot, folder, filename);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * The override goes through force-write.sh, which wraps run-pipeline.sh.
 *
 * Not the writer directly: run-pipeline.sh takes the /tmp/ssnn-pipeline.lock
 * singleton, so an override cannot run beside the loop's writer stage and lose
 * an articles-state.json write — the file is rewritten whole. It also carries
 * the story on through editor and image in the same run, instead of leaving it
 * to wait out the loop's 180s cycle.
 */
export function buildForceWriteCommand(
  outputsRoot: string,
  filename: string
): ForceWriteCommand {
  return {
    command: "/bin/bash",
    args: [path.join(outputsRoot, "force-write.sh"), filename],
    cwd: outputsRoot,
  };
}

function isForceWriteStatus(value: unknown): value is ForceWriteStatus {
  return (
    typeof value === "string" &&
    FORCE_WRITE_STATUSES.includes(value as ForceWriteStatus)
  );
}

export async function readForceWriteJobs(
  jobsRoot: string
): Promise<ForceWriteJobsReadResult> {
  const jobs = new Map<string, ForceWriteJob>();
  const warnings: string[] = [];

  let entries: string[];
  try {
    entries = await fs.readdir(jobsRoot);
  } catch {
    return { jobs, warnings };
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const { data, warning } = await readJsonFile<unknown>(
      path.join(jobsRoot, entry)
    );
    if (warning) {
      warnings.push(warning);
      continue;
    }
    if (!data || typeof data !== "object") continue;

    const record = data as Partial<ForceWriteJob>;
    if (
      typeof record.filename !== "string" ||
      !isForceWriteStatus(record.status) ||
      typeof record.startedAt !== "string"
    ) {
      warnings.push(`Invalid force-write job shape: ${entry}`);
      continue;
    }

    jobs.set(record.filename, {
      filename: record.filename,
      status: record.status,
      startedAt: record.startedAt,
      finishedAt:
        typeof record.finishedAt === "string" ? record.finishedAt : undefined,
      logPath: typeof record.logPath === "string" ? record.logPath : "",
    });
  }

  return { jobs, warnings };
}

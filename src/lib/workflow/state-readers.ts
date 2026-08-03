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

export interface EditorialSkip {
  /** Why the writer's editorial gate declined to write this doc. */
  reason: string;
  skippedAt: string;
}

export interface EditorialSkipsReadResult {
  skips: Map<string, EditorialSkip>;
  warnings: string[];
}

const STATED_REASON_FALLBACK = "Scored below the editorial threshold.";

/**
 * The research docs the writer-agent's editorial gate declined to write.
 *
 * `articles-state.json` records three outcomes per doc, and only one of them is
 * a settled editorial decision:
 *
 *   write — has an `article`; the completed-research path already handles it
 *   skip  — the gate said no; nothing surfaced this until the spiked tray
 *   error — a transient failure that the next pipeline run retries
 *
 * Reading an error as a rejection would tell the operator a story was spiked
 * when the pipeline is in fact about to try it again.
 */
export async function readEditorialSkips(
  articlesRoot: string
): Promise<EditorialSkipsReadResult> {
  const statePath = path.join(articlesRoot, "articles-state.json");
  const { data, warning } = await readJsonFile<unknown>(statePath);
  if (warning) return { skips: new Map(), warnings: [warning] };

  const skips = new Map<string, EditorialSkip>();
  if (!data || typeof data !== "object") return { skips, warnings: [] };

  const processed = (data as { processed?: unknown }).processed;
  if (!processed || typeof processed !== "object") return { skips, warnings: [] };

  for (const [filename, entry] of Object.entries(
    processed as Record<string, unknown>
  )) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as {
      editorial_decision?: unknown;
      skip_reason?: unknown;
      processed_at?: unknown;
    };
    if (record.editorial_decision !== "skip") continue;

    skips.set(filename, {
      reason:
        typeof record.skip_reason === "string" && record.skip_reason.trim()
          ? record.skip_reason.trim()
          : STATED_REASON_FALLBACK,
      skippedAt:
        typeof record.processed_at === "string" ? record.processed_at : "",
    });
  }

  return { skips, warnings: [] };
}

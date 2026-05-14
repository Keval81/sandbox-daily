import { findLatestJobFor, readReviewRequestFor } from "./jobs";
import type { JobRecord, ReviewRequest } from "./types";

export interface PersistedRevisionStateInput {
  status: string;
  vertical: ReviewRequest["vertical"];
  slug: string;
  jobsRoot?: string;
  requestsRoot?: string;
}

export interface PersistedRevisionState {
  job: JobRecord | null;
  request: ReviewRequest | null;
  lastError: string | null;
  canRetry: boolean;
}

export async function getPersistedRevisionState(
  input: PersistedRevisionStateInput
): Promise<PersistedRevisionState | null> {
  if (input.status !== "revision-requested") return null;

  const [job, request] = await Promise.all([
    findLatestJobFor(input.vertical, input.slug, input.jobsRoot),
    readReviewRequestFor(input.vertical, input.slug, input.requestsRoot),
  ]);

  return {
    job,
    request,
    lastError: job?.error ?? null,
    canRetry: job?.status === "error" && request !== null,
  };
}

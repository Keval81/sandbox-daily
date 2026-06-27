// src/lib/revision/progress.ts

/** After this long, warn the reviewer it's slow — but KEEP polling. */
export const REVISION_SLOW_AFTER_MS = 5 * 60_000;
/** Only after this long do we give up polling and show "appears stuck". */
export const REVISION_HARD_TIMEOUT_MS = 20 * 60_000;

export type RevisionProgress = "active" | "slow" | "stuck";

/**
 * A long revision (a big article, or transient API retries) can legitimately
 * run several minutes. The UI used to abandon the job at 5 minutes; instead we
 * warn at 5 minutes but keep polling, and only call it stuck after a generous
 * hard ceiling.
 */
export function classifyRevisionProgress(
  elapsedMs: number,
  slowAfterMs: number = REVISION_SLOW_AFTER_MS,
  hardTimeoutMs: number = REVISION_HARD_TIMEOUT_MS
): RevisionProgress {
  if (elapsedMs >= hardTimeoutMs) return "stuck";
  if (elapsedMs >= slowAfterMs) return "slow";
  return "active";
}

/**
 * Whether this process may serve the operator surfaces — `/admin/radar`,
 * `/admin/workflow`, `/review` and the review APIs.
 *
 * An explicit opt-in flag, NOT `NODE_ENV !== "production"`, for two reasons.
 *
 * First, the old gate let `/review` slip through: it never received a guard at
 * all, so the deployed site served the review queue to anyone who typed the URL
 * (harmless while nothing was pending, and a leak of unpublished drafts the
 * moment one was). A single named predicate is something a reviewer can grep
 * for; four hand-written NODE_ENV checks are something one route can forget.
 *
 * Second, the operator server on the Mac should be free to run a production
 * build — faster, lighter — without that choice silently deciding whether the
 * pipeline's controls exist. What decides it is `SANDBOX_ADMIN=1`, set in
 * .env.local and by the launchd job, and set nowhere on Vercel.
 *
 * Exactly "1": no truthiness, no "true"/"yes"/"on". A flag that opens a control
 * surface should be impossible to enable by accident.
 */
export function operatorSurfaceEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SANDBOX_ADMIN === "1";
}

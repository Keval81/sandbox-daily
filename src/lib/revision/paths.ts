// src/lib/revision/paths.ts
import path from "node:path";

const HOME = process.env.HOME ?? "/Users/sandboxsansan";

export const REVIEW_REQUESTS_ROOT =
  process.env.SSNN_REVIEW_REQUESTS_ROOT
  ?? path.join(HOME, "Desktop/ssnn-outputs/review-requests");

export const REVIEW_JOBS_ROOT =
  process.env.SSNN_REVIEW_JOBS_ROOT
  ?? path.join(HOME, "Desktop/ssnn-outputs/review-jobs");

export const REVISER_AGENT_PATH =
  process.env.REVISER_AGENT_PATH
  ?? path.join(HOME, "Desktop/ssnn-outputs/reviser-agent");

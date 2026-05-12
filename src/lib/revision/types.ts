// src/lib/revision/types.ts

/**
 * Mirrors ssnn-outputs/reviser-agent/src/types.ts.
 * Keep these two files in sync.
 */

export interface InlineComment {
  id: string;
  quote: string;
  paragraph_index: number;
  paragraph_text: string;
  preceding_context: string;
  following_context: string;
  comment: string;
  created_at: string;
}

export interface ImageRevision {
  regenerate: boolean;
  context: string | null;
}

export interface ReviewRequest {
  slug: string;
  vertical: "news" | "sport" | "tech" | "features";
  round: number;
  submitted_at: string;
  overall_notes: string;
  inline_comments: InlineComment[];
  image: ImageRevision;
}

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobRecord {
  id: string;
  slug: string;
  vertical: ReviewRequest["vertical"];
  status: JobStatus;
  current_step: string | null;
  started_at: string;
  updated_at: string;
  error: string | null;
  log_path: string;
}

export const VERTICALS = ["news", "sport", "tech", "features"] as const;

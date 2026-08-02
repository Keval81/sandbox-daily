import type { Article } from "@/lib/types";

/** `edited_at` as epoch ms, or 0 when absent or unparseable — a missing stamp
 *  must never sort a story ahead of one that has it. */
const editedMs = (article: Article): number => {
  const parsed = article.editedAt ? Date.parse(article.editedAt) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Newest first: publication date, then when the story was actually finished.
 *
 * The tie-break is not a nicety. The pipeline stamps `date` as date-only at
 * midnight UTC, so every story published on the same day is tied to the
 * millisecond — and a tied comparator falls through to whatever order
 * `readdirSync` happened to return. On 2026-08-02 that put a piece packaged at
 * 12:28 in the lead slot over one packaged at 16:12: the front page's lead
 * story was being chosen by filesystem order, on any day with more than one
 * story, which is most days.
 *
 * `edited_at` is the last thing the editor agent writes, so it is the closest
 * thing in the frontmatter to "when this became publishable".
 */
export const byRecency = (a: Article, b: Article): number => {
  const byDate = Date.parse(b.date) - Date.parse(a.date);
  return byDate !== 0 ? byDate : editedMs(b) - editedMs(a);
};

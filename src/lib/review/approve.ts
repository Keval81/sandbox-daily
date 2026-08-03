import { readFile, writeFile } from "node:fs/promises";
import matter from "gray-matter";

export interface ApprovalFields {
  title?: string;
  standfirst?: string;
  social_post?: string;
}

export interface ApproveResult {
  /** The final headline, so the publish commit carries what was approved. */
  title?: string;
  /** False when the article on disk already said exactly this. */
  changed: boolean;
}

/**
 * Flips an article to published and stamps when it was approved.
 *
 * `approved_at` is written once and never restamped. That is not cosmetic:
 * publishArticle treats "nothing staged" as a re-approval and skips the commit,
 * and a fresh timestamp on every call dirtied the file just enough to keep that
 * guard permanently unreachable — one article approved seven times shipped
 * seven production builds, each changing that single line.
 */
export async function approveArticle(
  articlePath: string,
  fields?: ApprovalFields
): Promise<ApproveResult> {
  const raw = await readFile(articlePath, "utf-8");
  const parsed = matter(raw);

  if (fields?.title && fields.title.trim()) parsed.data.title = fields.title.trim();
  if (typeof fields?.standfirst === "string") parsed.data.standfirst = fields.standfirst.trim();
  if (typeof fields?.social_post === "string") parsed.data.social_post = fields.social_post.trim();
  parsed.data.status = "published";
  parsed.data.approved_at ??= new Date().toISOString();

  const next = matter.stringify(parsed.content, parsed.data);
  const changed = next !== raw;
  if (changed) await writeFile(articlePath, next, "utf-8");

  return {
    title: typeof parsed.data.title === "string" ? parsed.data.title : undefined,
    changed,
  };
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Serialises approvals of one article, so taps that land while the first is
 * still pushing join it instead of starting a second git run.
 *
 * Publishing takes seconds (stage a multi-megabyte hero, commit, push) and the
 * operator approves from a phone, where an unresponsive button gets tapped
 * again. Without this, two requests both read the pre-approval file and both
 * commit — the idempotency check above only helps once the first write lands.
 */
export function withApprovalLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const started = work().finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

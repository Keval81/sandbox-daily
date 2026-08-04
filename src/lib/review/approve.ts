import { readFile, writeFile } from "node:fs/promises";
import matter from "gray-matter";

export interface ApprovalFields {
  title?: string;
  standfirst?: string;
  social_post?: string;
  /** Front-page lead opt-in. `true` writes the key, `false` clears it, and
   *  absent leaves whatever the file already says. */
  homepage_lead?: boolean;
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
  // gray-matter caches parse results process-wide, keyed by the file's content,
  // and hands them back as a SHALLOW copy — so `parsed.data` is the very object
  // in that cache. Mutating it edits what every later parse of identical content
  // sees, including keys deleted here. Work on a copy.
  const data = { ...parsed.data };

  if (fields?.title && fields.title.trim()) data.title = fields.title.trim();
  if (typeof fields?.standfirst === "string") data.standfirst = fields.standfirst.trim();
  if (typeof fields?.social_post === "string") data.social_post = fields.social_post.trim();
  // Never written as `false`: an approval that changes one line stages a commit
  // and ships a production build, so the "unticked" case deletes the key and a
  // repeat approval stays byte-identical.
  if (fields?.homepage_lead === true) data.homepage_lead = true;
  else if (fields?.homepage_lead === false) delete data.homepage_lead;
  data.status = "published";
  data.approved_at ??= new Date().toISOString();

  const next = matter.stringify(parsed.content, data);
  const changed = next !== raw;
  if (changed) await writeFile(articlePath, next, "utf-8");

  return {
    title: typeof data.title === "string" ? data.title : undefined,
    changed,
  };
}

/**
 * Narrows an untrusted request body to the fields approval accepts.
 *
 * Anything that is not a real boolean becomes "not stated" rather than a
 * rejection — the field is absent on every news and features approval, and a
 * malformed value must not clear a flag the operator set.
 */
export function normaliseApprovalFields(fields: unknown): ApprovalFields | undefined {
  if (!fields || typeof fields !== "object") return undefined;
  const f = fields as Record<string, unknown>;
  return {
    title: typeof f.title === "string" ? f.title : undefined,
    standfirst: typeof f.standfirst === "string" ? f.standfirst : undefined,
    social_post: typeof f.social_post === "string" ? f.social_post : undefined,
    homepage_lead: typeof f.homepage_lead === "boolean" ? f.homepage_lead : undefined,
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

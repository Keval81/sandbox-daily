import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const DEFAULT_REPO = process.cwd();

/** Long enough for a cold push over a poor connection, short enough that an
 *  approval never hangs the operator's phone. */
const GIT_TIMEOUT_MS = 60_000;

export interface PublishResult {
  ok: boolean;
  /** Short sha, when a commit was actually created. */
  commit?: string;
  /** True when the article was already committed — approving twice is not an error. */
  alreadyPublished?: boolean;
  /** True when the first push was rejected and a rebase got it through. */
  rebased?: boolean;
  error?: string;
}

/**
 * Exactly the files this article owns — never `git add -A`.
 *
 * The repo routinely carries unrelated work in progress (a refreshed radar
 * snapshot, half-finished components). Staging everything would publish that
 * alongside the story, from a button whose entire promise is "publish THIS".
 *
 * Image matching is `slug.ext` or `slug-inline-N.ext` only. A prefix match
 * would sweep in `a-story-longer-slug.png`, which belongs to a different piece.
 */
export function stagedPathsFor(
  vertical: string,
  markdownFilename: string,
  slug: string,
  imageFilenames: string[]
): string[] {
  const owned = new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-inline-\\d+)?\\.[a-z0-9]+$`, "i");
  return [
    `src/content/${vertical}/${markdownFilename}`,
    ...imageFilenames.filter((name) => owned.test(name)).map((name) => `public/images/articles/${name}`),
  ];
}

/** Headline first, because `git log --oneline` is how this history gets read. */
export function commitMessage(title: string, vertical: string): string {
  const subject = title.replace(/\s+/g, " ").trim();
  return `content: publish '${subject}'\n\nApproved at /review on the operator server (${vertical}) and pushed straight to production.`;
}

/** Rejections a fetch + rebase can fix — as opposed to auth, DNS or permissions,
 *  where retrying is just a slower way to fail. */
export function needsRebaseRetry(stderr: string): boolean {
  return /\((?:fetch first|non-fast-forward)\)|remote contains work that you do not have/i.test(stderr);
}

const git = async (repo: string, args: string[]): Promise<{ stdout: string; stderr: string }> =>
  run("git", args, { cwd: repo, timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });

const errText = (err: unknown): string => {
  const e = err as { stderr?: string; stdout?: string; message?: string };
  return (e.stderr || e.stdout || e.message || String(err)).trim();
};

/**
 * Commits an approved article and pushes it, so approval and publication are
 * the same action.
 *
 * Approving used to flip frontmatter and stop there — the story appeared on the
 * operator server while the live site stayed unchanged until someone remembered
 * to commit. The UI said "Approved — now live", which was not true.
 */
export async function publishArticle(
  vertical: string,
  markdownFilename: string,
  slug: string,
  title: string,
  /** Explicit rather than read from module scope, so the integration test can
   *  point the whole path at a throwaway repo with its own local remote. */
  repo: string = DEFAULT_REPO
): Promise<PublishResult> {
  try {
    const images = await readdir(path.join(repo, "public/images/articles")).catch(() => [] as string[]);
    const paths = stagedPathsFor(vertical, markdownFilename, slug, images);

    await git(repo, ["add", "--", ...paths]);

    // Nothing staged means the article and its images are already committed —
    // a re-approval, not a failure.
    const staged = await git(repo, ["diff", "--cached", "--name-only"]);
    if (staged.stdout.trim() === "") {
      return { ok: true, alreadyPublished: true };
    }

    await git(repo, ["commit", "-m", commitMessage(title, vertical)]);
    const sha = (await git(repo, ["rev-parse", "--short", "HEAD"])).stdout.trim();

    let rebased = false;
    try {
      await git(repo, ["push", "origin", "HEAD:main"]);
    } catch (pushErr) {
      const stderr = errText(pushErr);
      if (!needsRebaseRetry(stderr)) {
        // Committed but not pushed: say so precisely. The work is safe locally
        // and one `git push` finishes it.
        return { ok: false, commit: sha, error: `committed ${sha}, push failed: ${stderr.split("\n").pop()}` };
      }
      await git(repo, ["fetch", "origin", "main"]);
      await git(repo, ["rebase", "origin/main"]);
      rebased = true;
      try {
        await git(repo, ["push", "origin", "HEAD:main"]);
      } catch (retryErr) {
        return {
          ok: false,
          commit: sha,
          rebased,
          error: `committed ${sha}, push failed after rebase: ${errText(retryErr).split("\n").pop()}`,
        };
      }
    }

    return { ok: true, commit: sha, rebased };
  } catch (err) {
    return { ok: false, error: errText(err).split("\n").pop() };
  }
}

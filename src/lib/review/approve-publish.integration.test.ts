import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import matter from "gray-matter";

import { approveArticle, withApprovalLock } from "./approve";
import { publishArticle } from "./publish";

const run = promisify(execFile);

/**
 * The seam the shipped bug lived in. approveArticle and publishArticle are each
 * fine alone — publish even has an "already published" guard — but approve
 * restamping approved_at on every call kept that guard permanently unreachable,
 * so one article approved seven times produced seven production builds.
 * These tests drive the two together, in the order the route does.
 */
const buildRepo = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sd-approve-publish-"));
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");

  await run("git", ["init", "--bare", "--initial-branch=main", remote]);
  await run("git", ["clone", remote, work]);
  await run("git", ["config", "user.email", "test@example.com"], { cwd: work });
  await run("git", ["config", "user.name", "Test"], { cwd: work });

  await mkdir(path.join(work, "src/content/sport"), { recursive: true });
  await mkdir(path.join(work, "public/images/articles"), { recursive: true });
  await writeFile(path.join(work, "README.md"), "seed\n");
  await run("git", ["add", "-A"], { cwd: work });
  await run("git", ["commit", "-m", "seed"], { cwd: work });
  await run("git", ["push", "origin", "main"], { cwd: work });

  const article = path.join(work, "src/content/sport/2026-08-02-a-story.md");
  await writeFile(article, "---\ntitle: A story\nstatus: pending\n---\n\nbody\n", "utf-8");
  await writeFile(path.join(work, "public/images/articles/a-story.png"), "png");

  return { work, article };
};

/** Mirrors the /api/review approve branch: stamp frontmatter, then publish. */
const approveAndPublish = async (
  work: string,
  article: string,
  fields?: { title?: string }
) => {
  const { title } = await approveArticle(article, fields);
  return publishArticle("sport", path.basename(article), "a-story", title ?? "a-story", work);
};

const commitCount = async (work: string) =>
  Number((await run("git", ["rev-list", "--count", "HEAD"], { cwd: work })).stdout.trim());

test("approving the same article twice produces exactly one commit", async () => {
  const { work, article } = await buildRepo();

  await approveAndPublish(work, article);
  const afterFirst = await commitCount(work);
  const second = await approveAndPublish(work, article);

  assert.equal(second.ok, true, `second approval failed: ${second.error}`);
  assert.equal(second.alreadyPublished, true, "expected the second approval to be a no-op");
  assert.equal(await commitCount(work), afterFirst);
});

test("seven rapid approvals produce exactly one commit", async () => {
  const { work, article } = await buildRepo();
  const before = await commitCount(work);

  for (let i = 0; i < 7; i++) {
    await withApprovalLock("sport/a-story", () => approveAndPublish(work, article));
  }

  assert.equal(await commitCount(work), before + 1);
});

test("approvals that land while the first is still running still commit once", async () => {
  const { work, article } = await buildRepo();
  const before = await commitCount(work);

  await Promise.all(
    Array.from({ length: 3 }, () =>
      withApprovalLock("sport/a-story", () => approveAndPublish(work, article))
    )
  );

  assert.equal(await commitCount(work), before + 1);
});

test("re-approving with an edited headline publishes the edit", async () => {
  const { work, article } = await buildRepo();
  await approveAndPublish(work, article);
  const afterFirst = await commitCount(work);

  const second = await approveAndPublish(work, article, { title: "A better headline" });

  assert.equal(second.ok, true, `re-approval failed: ${second.error}`);
  assert.equal(await commitCount(work), afterFirst + 1);
  assert.equal(matter(await readFile(article, "utf-8")).data.title, "A better headline");
});

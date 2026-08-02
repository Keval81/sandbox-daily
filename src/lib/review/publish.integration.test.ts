import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";

const run = promisify(execFile);

/**
 * Exercises the real git path — staging, committing, pushing to a remote —
 * against a disposable repo. The unit tests cover which paths get staged; this
 * covers whether the commands actually work and, crucially, that unrelated
 * work in progress is left alone.
 */
const buildRepo = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sd-publish-"));
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");

  await run("git", ["init", "--bare", "--initial-branch=main", remote]);
  await run("git", ["clone", remote, work]);
  await run("git", ["config", "user.email", "test@example.com"], { cwd: work });
  await run("git", ["config", "user.name", "Test"], { cwd: work });

  await mkdir(path.join(work, "src/content/news"), { recursive: true });
  await mkdir(path.join(work, "public/images/articles"), { recursive: true });
  await writeFile(path.join(work, "README.md"), "seed\n");
  await run("git", ["add", "-A"], { cwd: work });
  await run("git", ["commit", "-m", "seed"], { cwd: work });
  await run("git", ["push", "origin", "main"], { cwd: work });

  return { root, remote, work };
};

import { publishArticle } from "./publish";

const publishIn = (work: string, ...args: [string, string, string, string]) =>
  publishArticle(...args, work);

test("publishing an approved article commits it and pushes it to the remote", async () => {
  const { work, remote } = await buildRepo();
  await writeFile(path.join(work, "src/content/news/2026-08-02-a-story.md"), "---\ntitle: A story\n---\nbody\n");
  await writeFile(path.join(work, "public/images/articles/a-story.png"), "png");

  const result = await publishIn(work, "news", "2026-08-02-a-story.md", "a-story", "A story");
  assert.equal(result.ok, true, `publish failed: ${result.error}`);
  assert.ok(result.commit, "expected a commit sha");

  const remoteFiles = await run("git", ["ls-tree", "-r", "--name-only", "main"], { cwd: remote });
  assert.match(remoteFiles.stdout, /src\/content\/news\/2026-08-02-a-story\.md/);
  assert.match(remoteFiles.stdout, /public\/images\/articles\/a-story\.png/);

  const subject = await run("git", ["log", "-1", "--format=%s", "main"], { cwd: remote });
  assert.match(subject.stdout, /^content: publish 'A story'/);
});

test("unrelated work in progress is never swept into the publish commit", async () => {
  const { work, remote } = await buildRepo();
  await writeFile(path.join(work, "src/content/news/2026-08-02-b-story.md"), "---\ntitle: B\n---\nbody\n");
  // The repo routinely carries these: a refreshed snapshot, a half-edited file.
  await writeFile(path.join(work, "README.md"), "seed\nHALF-FINISHED EDIT\n");
  await writeFile(path.join(work, "src/content/news/2026-08-02-not-approved.md"), "---\ntitle: Draft\n---\n");

  const result = await publishIn(work, "news", "2026-08-02-b-story.md", "b-story", "B");
  assert.equal(result.ok, true, `publish failed: ${result.error}`);

  const files = await run("git", ["show", "--name-only", "--format=", "main"], { cwd: remote });
  assert.match(files.stdout, /2026-08-02-b-story\.md/);
  assert.doesNotMatch(files.stdout, /README\.md/, "an unrelated edit was published");
  assert.doesNotMatch(files.stdout, /not-approved/, "an unapproved draft was published");

  const readme = await readFile(path.join(work, "README.md"), "utf-8");
  assert.match(readme, /HALF-FINISHED EDIT/, "the working tree edit should survive untouched");
});

test("approving a second time reports already-published instead of failing", async () => {
  const { work } = await buildRepo();
  await writeFile(path.join(work, "src/content/news/2026-08-02-c.md"), "---\ntitle: C\n---\nbody\n");
  const first = await publishIn(work, "news", "2026-08-02-c.md", "c", "C");
  assert.equal(first.ok, true);
  const second = await publishIn(work, "news", "2026-08-02-c.md", "c", "C");
  assert.equal(second.ok, true);
  assert.equal(second.alreadyPublished, true);
});

test("a remote that has moved on is rebased onto, not failed", async () => {
  const { work, remote, root } = await buildRepo();

  // Someone else pushes first — the everyday case when the pipeline commits.
  const other = path.join(root, "other");
  await run("git", ["clone", remote, other]);
  await run("git", ["config", "user.email", "other@example.com"], { cwd: other });
  await run("git", ["config", "user.name", "Other"], { cwd: other });
  await writeFile(path.join(other, "elsewhere.txt"), "meanwhile\n");
  await run("git", ["add", "-A"], { cwd: other });
  await run("git", ["commit", "-m", "other work"], { cwd: other });
  await run("git", ["push", "origin", "main"], { cwd: other });

  await writeFile(path.join(work, "src/content/news/2026-08-02-d.md"), "---\ntitle: D\n---\nbody\n");
  const result = await publishIn(work, "news", "2026-08-02-d.md", "d", "D");

  assert.equal(result.ok, true, `publish failed: ${result.error}`);
  assert.equal(result.rebased, true, "expected the rebase retry to have run");
  const files = await run("git", ["ls-tree", "-r", "--name-only", "main"], { cwd: remote });
  assert.match(files.stdout, /2026-08-02-d\.md/);
  assert.match(files.stdout, /elsewhere\.txt/, "the other author's work must survive");
});

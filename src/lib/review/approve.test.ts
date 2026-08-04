import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import matter from "gray-matter";

import { approveArticle, withApprovalLock, normaliseApprovalFields } from "./approve";

const pendingArticle = async (frontmatter = "") => {
  const dir = await mkdtemp(path.join(tmpdir(), "sd-approve-"));
  const file = path.join(dir, "2026-08-02-a-story.md");
  await writeFile(
    file,
    `---\ntitle: A story\nstandfirst: A dek\nsocial_post: A post\nstatus: pending\n${frontmatter}---\n\nbody\n`,
    "utf-8"
  );
  return file;
};

const frontmatterOf = async (file: string) => matter(await readFile(file, "utf-8")).data;

test("approving a pending article publishes it and stamps approved_at", async () => {
  const file = await pendingArticle();

  const result = await approveArticle(file);

  const data = await frontmatterOf(file);
  assert.equal(result.changed, true);
  assert.equal(data.status, "published");
  assert.ok(data.approved_at, "expected an approved_at stamp");
});

test("approving twice keeps the first approved_at rather than restamping it", async () => {
  const file = await pendingArticle();
  await approveArticle(file);
  const first = (await frontmatterOf(file)).approved_at;

  await approveArticle(file);

  assert.equal((await frontmatterOf(file)).approved_at, first);
});

test("a second approval that changes nothing reports changed: false", async () => {
  const file = await pendingArticle();
  await approveArticle(file);

  const result = await approveArticle(file);

  assert.equal(result.changed, false);
});

test("a second approval that changes nothing leaves the file byte-identical", async () => {
  const file = await pendingArticle();
  await approveArticle(file);
  const before = await readFile(file, "utf-8");

  await approveArticle(file);

  assert.equal(await readFile(file, "utf-8"), before);
});

test("resending the unchanged packaging fields reports changed: false", async () => {
  // The review UI always posts the current headline/standfirst/caption, so a
  // second tap arrives with fields — identical ones. That must still be a no-op.
  const file = await pendingArticle();
  const fields = { title: "A story", standfirst: "A dek", social_post: "A post" };
  await approveArticle(file, fields);

  const result = await approveArticle(file, fields);

  assert.equal(result.changed, false);
});

test("a headline edited on a later approval is still applied", async () => {
  const file = await pendingArticle();
  await approveArticle(file);

  const result = await approveArticle(file, { title: "A better headline" });

  assert.equal(result.changed, true);
  assert.equal((await frontmatterOf(file)).title, "A better headline");
  assert.equal(result.title, "A better headline");
});

test("two simultaneous approvals of the same article run the work once", async () => {
  let runs = 0;
  const work = async () => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return runs;
  };

  const [a, b] = await Promise.all([
    withApprovalLock("sport/a-story", work),
    withApprovalLock("sport/a-story", work),
  ]);

  assert.equal(runs, 1);
  assert.equal(a, 1);
  assert.equal(b, 1);
});

test("approvals of different articles are not blocked by each other", async () => {
  let runs = 0;
  const work = async () => {
    runs += 1;
    return runs;
  };

  await Promise.all([
    withApprovalLock("sport/a-story", work),
    withApprovalLock("news/another-story", work),
  ]);

  assert.equal(runs, 2);
});

test("the lock is released once the work finishes, so a later approval can run", async () => {
  let runs = 0;
  const work = async () => {
    runs += 1;
    return runs;
  };

  await withApprovalLock("sport/a-story", work);
  await withApprovalLock("sport/a-story", work);

  assert.equal(runs, 2);
});

test("a failed approval releases the lock instead of wedging the slug", async () => {
  const boom = async () => {
    throw new Error("git exploded");
  };

  await assert.rejects(withApprovalLock("sport/a-story", boom), /git exploded/);

  assert.equal(await withApprovalLock("sport/a-story", async () => "ok"), "ok");
});

test("approving with the lead box ticked flags the article", async () => {
  const file = await pendingArticle();

  await approveArticle(file, { homepage_lead: true });

  assert.equal((await frontmatterOf(file)).homepage_lead, true);
});

test("approving with the box unticked removes the key rather than writing false", async () => {
  const file = await pendingArticle("homepage_lead: true\n");

  await approveArticle(file, { homepage_lead: false });

  assert.equal("homepage_lead" in (await frontmatterOf(file)), false);
});

test("an approval that omits the field leaves an existing flag alone", async () => {
  const file = await pendingArticle("homepage_lead: true\n");

  await approveArticle(file, { title: "A story" });

  assert.equal((await frontmatterOf(file)).homepage_lead, true);
});

test("re-approving with the same lead state stages nothing", async () => {
  // The guard publishArticle relies on: identical bytes, no commit, no build.
  const file = await pendingArticle();
  await approveArticle(file, { homepage_lead: true });

  const second = await approveArticle(file, { homepage_lead: true });

  assert.equal(second.changed, false);
});

test("a non-boolean homepage_lead is treated as not stated", () => {
  // A malformed payload must never silently clear an operator's flag.
  const fields = normaliseApprovalFields({ homepage_lead: "true" });
  assert.equal(fields?.homepage_lead, undefined);
});

test("normalising nothing gives nothing", () => {
  assert.equal(normaliseApprovalFields(undefined), undefined);
});

test("normalising keeps the packaging fields it is given", () => {
  const fields = normaliseApprovalFields({
    title: "A headline",
    standfirst: "A dek",
    social_post: "A post",
    homepage_lead: true,
  });
  assert.deepEqual(fields, {
    title: "A headline",
    standfirst: "A dek",
    social_post: "A post",
    homepage_lead: true,
  });
});

test("approving one article does not corrupt what a later parse of identical content sees", async () => {
  // gray-matter caches parse results process-wide, keyed by content, and hands
  // them back as a SHALLOW copy — so parsed.data IS the cache entry. Mutating
  // it (or deleting a key from it) rewrites history for every later read of a
  // byte-identical file.
  const first = await pendingArticle("homepage_lead: true\n");
  const second = await pendingArticle("homepage_lead: true\n");

  await approveArticle(first, { homepage_lead: false });

  assert.equal((await frontmatterOf(second)).homepage_lead, true);
});

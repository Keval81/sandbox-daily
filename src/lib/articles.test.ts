import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArticleDir, parseArticleFile } from "./articles";

/** A real markdown file in a temp dir — the parser reads from disk. */
const articleFile = async (extraFrontmatter: string) => {
  const dir = await mkdtemp(path.join(tmpdir(), "sd-articles-"));
  const filename = "2026-08-04-a-story.md";
  await writeFile(
    path.join(dir, filename),
    `---\ntitle: A story\ndate: '2026-08-04'\ncategory: sport\nword_count: 800\nstatus: published\n${extraFrontmatter}---\n\nbody\n`,
    "utf-8"
  );
  return { dir, filename };
};

test("homepage_lead: true survives the frontmatter parse", async () => {
  const { dir, filename } = await articleFile("homepage_lead: true\n");
  assert.equal(parseArticleFile(dir, filename).homepageLead, true);
});

test("an article with no homepage_lead key is not flagged", async () => {
  const { dir, filename } = await articleFile("");
  assert.equal(parseArticleFile(dir, filename).homepageLead, false);
});

test("a quoted string in the frontmatter does not read as flagged", async () => {
  // YAML gives back the string "false", which is truthy — the reason the
  // check is === true and not a bare if.
  const { dir, filename } = await articleFile('homepage_lead: "false"\n');
  assert.equal(parseArticleFile(dir, filename).homepageLead, false);
});

test("structured sources in the frontmatter parse into a typed list", async () => {
  const { dir, filename } = await articleFile(
    "sources:\n" +
      "  - title: The report\n" +
      "    url: https://example.com/report\n" +
      "    publisher: Example Press\n" +
      "  - title: The interview\n" +
      "    url: http://example.org/interview\n"
  );
  assert.deepEqual(parseArticleFile(dir, filename).sources, [
    { title: "The report", url: "https://example.com/report", publisher: "Example Press" },
    { title: "The interview", url: "http://example.org/interview" },
  ]);
});

test("a source missing its title or url is dropped, the rest survive", async () => {
  const { dir, filename } = await articleFile(
    "sources:\n" +
      "  - title: No url here\n" +
      "  - url: https://example.com/no-title\n" +
      "  - title: Complete\n" +
      "    url: https://example.com/complete\n"
  );
  assert.deepEqual(parseArticleFile(dir, filename).sources, [
    { title: "Complete", url: "https://example.com/complete" },
  ]);
});

test("a source whose url is not http(s) is dropped", async () => {
  const { dir, filename } = await articleFile(
    "sources:\n" +
      "  - title: Sketchy\n" +
      "    url: 'javascript:alert(1)'\n"
  );
  assert.deepEqual(parseArticleFile(dir, filename).sources, []);
});

test("an article without a sources key carries none", async () => {
  const { dir, filename } = await articleFile("");
  assert.equal(parseArticleFile(dir, filename).sources, undefined);
});

/**
 * A directory read used to map every .md through gray-matter with no
 * isolation, so one file whose frontmatter opened on "*" or "'" threw and
 * 500'd /review — three articles took the whole operator queue down. A file
 * the parser cannot read must cost us that file and nothing else.
 */
const dirWith = async (files: Record<string, string>) => {
  const dir = await mkdtemp(path.join(tmpdir(), "sd-dir-"));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(path.join(dir, name), body, "utf-8");
  }
  return dir;
};

const goodFile = `---\ntitle: A story\ndate: '2026-08-04'\ncategory: sport\nword_count: 800\nstatus: published\n---\n\nbody\n`;
// "*A" reads as a YAML alias — the exact shape that broke the sport vertical.
const brokenFile = `---\ntitle: Broken\noriginal_title: **A £100m Yes**\ncategory: sport\n---\n\nbody\n`;

test("a file with unparseable frontmatter is skipped, not fatal", async (t) => {
  t.mock.method(console, "error", () => {});
  const dir = await dirWith({ "a-good.md": goodFile, "b-broken.md": brokenFile });
  const articles = parseArticleDir(dir);
  assert.equal(articles.length, 1);
  assert.equal(articles[0]?.title, "A story");
});

test("the skipped file is named in the error so it can be found", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const dir = await dirWith({ "b-broken.md": brokenFile });
  parseArticleDir(dir);
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0]?.arguments[0]), /b-broken\.md/);
});

test("a directory that does not exist reads as empty", () => {
  assert.deepEqual(parseArticleDir(path.join(tmpdir(), "sd-does-not-exist")), []);
});

/**
 * gray-matter caches the file object before it parses the YAML, so a throwing
 * file used to leave a cache entry with no data behind it. The second read of
 * the same content came back "fine" with empty frontmatter — and empty
 * frontmatter means no status, which defaults to published. A pending draft
 * that failed to parse would quietly go live on the next request.
 */
test("a file that fails to parse fails every time, not just the first", async () => {
  const dir = await dirWith({
    "x.md": `---\ntitle: Pending piece\noriginal_title: **A £100m Yes**\ncategory: sport\nstatus: pending\n---\n\nbody\n`,
  });
  for (const attempt of [1, 2, 3]) {
    assert.throws(
      () => parseArticleFile(dir, "x.md"),
      /alias/,
      `attempt ${attempt} should still throw`
    );
  }
});

test("a broken pending article never comes back as published", async () => {
  const dir = await dirWith({
    "y.md": `---\ntitle: Pending piece\noriginal_title: **A £100m Yes**\ncategory: sport\nstatus: pending\n---\n\nbody\n`,
  });
  try {
    parseArticleFile(dir, "y.md");
  } catch {
    // first read throws, as it should
  }
  assert.throws(() => parseArticleFile(dir, "y.md"));
});

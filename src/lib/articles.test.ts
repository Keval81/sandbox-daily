import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArticleFile } from "./articles";

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

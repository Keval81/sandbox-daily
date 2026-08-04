import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { approveArticle } from "@/lib/review/approve";
import { parseArticleFile } from "@/lib/articles";
import { selectHomepage } from "./select";
import type { Article, Vertical } from "@/lib/types";

/**
 * The whole seam: an approval writes frontmatter, the parser reads it back,
 * and the homepage decides. Every link is the real one — a unit test on a
 * hand-built Article proves the rule and nothing about whether the operator's
 * tick ever reaches it.
 */
const pendingSportStory = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sd-lead-"));
  const filename = "2026-08-04-the-transfer.md";
  await writeFile(
    path.join(dir, filename),
    `---\ntitle: The transfer\ndate: '2026-08-04'\ncategory: sport\nword_count: 800\nstatus: pending\n---\n\nbody\n`,
    "utf-8"
  );
  return { dir, filename, file: path.join(dir, filename) };
};

const published = (slug: string, category: Vertical, date: string): Article =>
  ({
    slug,
    category,
    date,
    title: slug,
    wordCount: 800,
    tags: [],
    content: "",
    status: "published",
    readTime: 4,
  }) as unknown as Article;

test("ticking the box on review puts a sport story on the front page", async () => {
  const { dir, filename, file } = await pendingSportStory();

  await approveArticle(file, { homepage_lead: true });
  const story = parseArticleFile(dir, filename);

  const { hero } = selectHomepage([story, published("n1", "news", "2026-08-03")], 3);
  assert.equal(hero[0].slug, "2026-08-04-the-transfer");
});

test("leaving the box unticked leaves the news story leading", async () => {
  const { dir, filename, file } = await pendingSportStory();

  await approveArticle(file, { homepage_lead: false });
  const story = parseArticleFile(dir, filename);

  const { hero } = selectHomepage([story, published("n1", "news", "2026-08-03")], 3);
  assert.equal(hero[0].slug, "n1");
  assert.equal(hero[1].slug, "2026-08-04-the-transfer");
});

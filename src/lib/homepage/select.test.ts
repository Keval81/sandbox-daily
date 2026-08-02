import test from "node:test";
import assert from "node:assert/strict";
import { selectHomepage, HERO_COUNT } from "./select";
import type { Article, Vertical } from "@/lib/types";

const article = (slug: string, category: Vertical, date: string): Article =>
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

/** Newest first — the order getAllArticles() hands over. */
const stock = (): Article[] => [
  article("n1", "news", "2026-08-02"),
  article("f1", "features", "2026-08-01"),
  article("n2", "news", "2026-07-31"),
  article("s1", "sport", "2026-07-30"),
  article("t1", "tech", "2026-07-29"),
  article("n3", "news", "2026-07-28"),
  article("f2", "features", "2026-07-27"),
  article("s2", "sport", "2026-07-26"),
  article("t2", "tech", "2026-07-25"),
];

test("no slug is ever printed twice across the whole page", () => {
  const { hero, sections } = selectHomepage(stock(), 3);
  const printed = [...hero, ...Object.values(sections).flat()].map((a) => a.slug);
  assert.equal(new Set(printed).size, printed.length);
});

test("the hero takes the newest four, in order", () => {
  const { hero } = selectHomepage(stock(), 3);
  assert.equal(hero.length, HERO_COUNT);
  assert.deepEqual(
    hero.map((a) => a.slug),
    ["n1", "f1", "n2", "s1"]
  );
});

test("a section never contains another vertical's article", () => {
  const { sections } = selectHomepage(stock(), 3);
  for (const [vertical, articles] of Object.entries(sections)) {
    for (const a of articles) assert.equal(a.category, vertical);
  }
});

test("sections skip what the hero already claimed", () => {
  const { sections } = selectHomepage(stock(), 3);
  assert.deepEqual(
    sections.news.map((a) => a.slug),
    ["n3"]
  );
  assert.deepEqual(
    sections.sport.map((a) => a.slug),
    ["s2"]
  );
});

test("a thin vertical returns what it has rather than padding", () => {
  // Two tech pieces exist and the hero claimed neither, so a request for six
  // returns two — never topped up from a vertical with more to spare.
  const { sections } = selectHomepage(stock(), 6);
  assert.deepEqual(
    sections.tech.map((a) => a.slug),
    ["t1", "t2"]
  );
  assert.ok(sections.tech.every((a) => a.category === "tech"));
});

test("every vertical is present as a key even when it has nothing left", () => {
  const onlyNews = [article("n1", "news", "2026-08-02")];
  const { sections } = selectHomepage(onlyNews, 6);
  assert.deepEqual(Object.keys(sections).sort(), ["features", "news", "sport", "tech"]);
  assert.deepEqual(sections.news, []);
});

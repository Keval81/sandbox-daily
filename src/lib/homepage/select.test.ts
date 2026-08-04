import test from "node:test";
import assert from "node:assert/strict";
import { selectHomepage, HERO_COUNT } from "./select";
import type { Article, Vertical } from "@/lib/types";

const article = (
  slug: string,
  category: Vertical,
  date: string,
  extra: Partial<Article> = {}
): Article =>
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
    ...extra,
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

/** Newest in the store is a sport story — the case Phase B made common. */
const sportOnTop = (extra: Partial<Article> = {}): Article[] => [
  article("s0", "sport", "2026-08-03", extra),
  ...stock(),
];

test("a sport story does not lead just by being newest", () => {
  const { hero } = selectHomepage(sportOnTop(), 3);
  assert.equal(hero[0].slug, "n1");
});

test("the sport story it skipped still appears, exactly once, below the lead", () => {
  const { hero, sections } = selectHomepage(sportOnTop(), 3);
  const printed = [...hero, ...Object.values(sections).flat()].map((a) => a.slug);
  assert.deepEqual(printed.filter((s) => s === "s0"), ["s0"]);
  assert.ok(hero.slice(1).some((a) => a.slug === "s0"), "expected s0 in the briefs");
});

test("a flagged sport story leads when nothing eligible is newer", () => {
  const { hero } = selectHomepage(sportOnTop({ homepageLead: true }), 3);
  assert.equal(hero[0].slug, "s0");
});

test("a flagged story yields to a newer news story", () => {
  // Flagged, but oldest in the list — the flag grants eligibility, not the slot.
  const articles = [...stock(), article("s9", "sport", "2026-07-24", { homepageLead: true })];
  assert.equal(selectHomepage(articles, 3).hero[0].slug, "n1");
});

test("with nothing eligible at all the newest story leads anyway", () => {
  // A front page with no lead is a worse failure than a sport story leading.
  const thin = [article("s0", "sport", "2026-08-03"), article("t0", "tech", "2026-08-02")];
  const { hero } = selectHomepage(thin, 3);
  assert.equal(hero[0].slug, "s0");
  assert.equal(hero.length, 2);
});

test("an empty store yields an empty hero rather than throwing", () => {
  const { hero, sections } = selectHomepage([], 3);
  assert.deepEqual(hero, []);
  assert.deepEqual(sections.news, []);
});

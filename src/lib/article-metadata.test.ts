import test from "node:test";
import assert from "node:assert/strict";
import type { Article } from "./types";
import {
  articleDescription,
  buildArticleJsonLd,
  buildArticleMetadata,
  serializeJsonLd,
  siteUrl,
} from "./article-metadata";

const article = (overrides: Partial<Article> = {}): Article => ({
  slug: "the-ceasefire-nobody-believes-in",
  title: "The Ceasefire Nobody Believes In",
  date: "2026-04-10",
  wordCount: 1288,
  tags: ["ceasefire", "ukraine"],
  category: "news",
  content:
    "# The Ceasefire Nobody Believes In\n\nIf you want to understand why this war has no end in sight, don't study the battlefield maps. Study the press release.\n\n---\n\nSecond paragraph here.\n",
  readTime: 7,
  status: "published",
  ...overrides,
});

test("siteUrl falls back to the vercel domain when the env var is unset", () => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  assert.equal(siteUrl(), "https://sandbox-daily.vercel.app");
});

test("siteUrl prefers NEXT_PUBLIC_SITE_URL and drops a trailing slash", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://sandboxdaily.co.uk/";
  assert.equal(siteUrl(), "https://sandboxdaily.co.uk");
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

test("description uses the standfirst when the article has one", () => {
  const a = article({ standfirst: "A crisp one-line summary." });
  assert.equal(articleDescription(a), "A crisp one-line summary.");
});

test("description falls back to the first body paragraph with markdown stripped", () => {
  const d = articleDescription(article());
  assert.equal(
    d,
    "If you want to understand why this war has no end in sight, don't study the battlefield maps. Study the press release."
  );
});

test("description fallback strips emphasis, links and quotes from the paragraph", () => {
  const a = article({
    content:
      "# Title\n\n> **Bold** start with a [link](https://example.com) and `code`.\n",
  });
  assert.equal(
    articleDescription(a),
    "Bold start with a link and code."
  );
});

test("description fallback truncates long paragraphs at a word boundary", () => {
  const a = article({ content: `# T\n\n${"word ".repeat(80)}\n` });
  const d = articleDescription(a);
  assert.ok(d.length <= 160, `expected <=160 chars, got ${d.length}`);
  assert.ok(d.endsWith("…"), `expected ellipsis ending, got "${d.slice(-10)}"`);
  assert.ok(!d.includes("wor…"), "should not cut mid-word");
});

test("metadata title carries the article title and the masthead", () => {
  const m = buildArticleMetadata(article());
  assert.equal(m.title, "The Ceasefire Nobody Believes In — Sandbox Daily");
});

test("metadata canonical is the vertical route path", () => {
  const m = buildArticleMetadata(article());
  assert.equal(m.alternates?.canonical, "/news/the-ceasefire-nobody-believes-in");
});

test("metadata canonical follows the article's vertical", () => {
  const m = buildArticleMetadata(article({ category: "sport", slug: "high-and-free" }));
  assert.equal(m.alternates?.canonical, "/sport/high-and-free");
});

test("open graph is an article with dates, tags and site name", () => {
  const m = buildArticleMetadata(
    article({ editedAt: "2026-04-11T17:15:00.996Z" })
  );
  const og = m.openGraph as Record<string, unknown>;
  assert.equal(og.type, "article");
  assert.equal(og.siteName, "Sandbox Daily");
  assert.equal(og.url, "/news/the-ceasefire-nobody-believes-in");
  assert.equal(og.publishedTime, new Date("2026-04-10").toISOString());
  assert.equal(og.modifiedTime, "2026-04-11T17:15:00.996Z");
  assert.deepEqual(og.tags, ["ceasefire", "ukraine"]);
});

test("open graph handles a YAML-parsed Date object in the date field", () => {
  const a = article({ date: new Date("2026-04-10") as unknown as string });
  const og = buildArticleMetadata(a).openGraph as Record<string, unknown>;
  assert.equal(og.publishedTime, new Date("2026-04-10").toISOString());
});

test("hero image flows into open graph and a large twitter card", () => {
  const a = article({ heroImage: "/images/articles/x.webp" });
  const m = buildArticleMetadata(a);
  const og = m.openGraph as { images?: unknown };
  assert.deepEqual(og.images, ["/images/articles/x.webp"]);
  const tw = m.twitter as { card?: string; images?: unknown };
  assert.equal(tw.card, "summary_large_image");
  assert.deepEqual(tw.images, ["/images/articles/x.webp"]);
});

test("no hero image means no og images and a plain summary card", () => {
  const m = buildArticleMetadata(article());
  const og = m.openGraph as { images?: unknown };
  assert.equal(og.images, undefined);
  const tw = m.twitter as { card?: string };
  assert.equal(tw.card, "summary");
});

test("metadata never introduces an author", () => {
  const m = buildArticleMetadata(article());
  assert.equal(m.authors, undefined);
  const og = m.openGraph as { authors?: unknown };
  assert.equal(og.authors, undefined);
});

test("json-ld is a NewsArticle with absolute urls and no author", () => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  const a = article({
    heroImage: "/images/articles/x.webp",
    editedAt: "2026-04-11T17:15:00.996Z",
    standfirst: "A crisp one-line summary.",
  });
  const ld = buildArticleJsonLd(a);
  assert.equal(ld["@context"], "https://schema.org");
  assert.equal(ld["@type"], "NewsArticle");
  assert.equal(ld.headline, "The Ceasefire Nobody Believes In");
  assert.equal(ld.description, "A crisp one-line summary.");
  assert.equal(ld.datePublished, new Date("2026-04-10").toISOString());
  assert.equal(ld.dateModified, "2026-04-11T17:15:00.996Z");
  assert.equal(
    ld.mainEntityOfPage,
    "https://sandbox-daily.vercel.app/news/the-ceasefire-nobody-believes-in"
  );
  assert.deepEqual(ld.image, ["https://sandbox-daily.vercel.app/images/articles/x.webp"]);
  assert.deepEqual(ld.keywords, ["ceasefire", "ukraine"]);
  assert.deepEqual(ld.publisher, {
    "@type": "Organization",
    name: "Sandbox Daily",
    url: "https://sandbox-daily.vercel.app",
  });
  assert.ok(!("author" in ld), "json-ld must not carry an author");
});

test("json-ld omits image and dateModified when the article has neither", () => {
  const ld = buildArticleJsonLd(article());
  assert.ok(!("image" in ld));
  assert.ok(!("dateModified" in ld));
});

test("serializeJsonLd escapes angle brackets so the script tag cannot be closed", () => {
  const out = serializeJsonLd({ headline: "a </script> attack" });
  assert.ok(!out.includes("</script>"));
  assert.ok(out.includes("\\u003c/script"));
});

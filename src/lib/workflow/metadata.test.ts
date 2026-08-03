import { test } from "node:test";
import assert from "node:assert/strict";
import { inferSlugFromFilename, parseWorkflowMarkdown } from "./metadata";

test("inferSlugFromFilename strips markdown extension", () => {
  assert.equal(
    inferSlugFromFilename(
      "2026-05-16-the-season-liverpool-forgot-how-to-be-liverpool.md"
    ),
    "2026-05-16-the-season-liverpool-forgot-how-to-be-liverpool"
  );
});

test("parseWorkflowMarkdown reads title, slug, category, status, and spotlight signals", () => {
  const parsed = parseWorkflowMarkdown(
    `---
title: The Man Who Lit The World
slug: the-man-who-lit-the-world
category: features
status: pending
feature_type: spotlight
subject_name: Nikola Tesla
date: 2026-05-01
---

Body text`
  );

  assert.equal(parsed.title, "The Man Who Lit The World");
  assert.equal(parsed.slug, "the-man-who-lit-the-world");
  assert.equal(parsed.category, "features");
  assert.equal(parsed.status, "pending");
  assert.equal(parsed.featureType, "spotlight");
  assert.equal(parsed.subjectName, "Nikola Tesla");
  assert.equal(parsed.date, "2026-05-01");
});

test("parseWorkflowMarkdown reads the vertical a promoted radar lead carries", () => {
  // Radar-sourced research docs stamp `vertical`, not `category` — the field
  // Phase B threads from promote → lead → research doc. Reading only
  // `category` rendered every one of them as "unknown".
  const meta = parseWorkflowMarkdown(
    "---\nsource: radar\nevent_id: gdelt-703a\nvertical: sport\n---\n\n# Semenyo hails Maresca\n"
  );

  assert.equal(meta.category, "sport");
});

test("parseWorkflowMarkdown prefers an explicit category over the radar vertical", () => {
  const meta = parseWorkflowMarkdown(
    "---\ncategory: features\nvertical: sport\n---\n\n# A piece\n"
  );

  assert.equal(meta.category, "features");
});

test("parseWorkflowMarkdown falls back to the first heading when there is no title", () => {
  const meta = parseWorkflowMarkdown(
    "---\nsource: radar\nvertical: sport\n---\n\n# Semenyo hails Maresca style of play as 'music to my ears'\n\nBody\n"
  );

  assert.equal(
    meta.title,
    "Semenyo hails Maresca style of play as 'music to my ears'"
  );
});

test("parseWorkflowMarkdown finds the heading in a doc with no frontmatter at all", () => {
  const meta = parseWorkflowMarkdown(
    "# Satellite killers: what a war in space might actually look like\n\n**Sources:** 4\n"
  );

  assert.equal(
    meta.title,
    "Satellite killers: what a war in space might actually look like"
  );
});

test("parseWorkflowMarkdown ignores deeper headings when looking for a title", () => {
  const meta = parseWorkflowMarkdown("---\nvertical: news\n---\n\n## Summary\n\nBody\n");

  assert.equal(meta.title, null);
});

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

import test from "node:test";
import assert from "node:assert/strict";
import { isLeadEligible, canPromoteToLead } from "./lead";
import type { Article, Vertical } from "@/lib/types";

const article = (category: Vertical, extra: Partial<Article> = {}): Article =>
  ({
    slug: "a-story",
    category,
    date: "2026-08-04",
    title: "A story",
    wordCount: 800,
    tags: [],
    content: "",
    status: "published",
    readTime: 4,
    ...extra,
  }) as unknown as Article;

test("news and features may lead without anyone opting in", () => {
  assert.equal(isLeadEligible(article("news")), true);
  assert.equal(isLeadEligible(article("features")), true);
});

test("sport and tech may not lead on their own", () => {
  assert.equal(isLeadEligible(article("sport")), false);
  assert.equal(isLeadEligible(article("tech")), false);
});

test("the operator's flag makes a sport story eligible", () => {
  assert.equal(isLeadEligible(article("sport", { homepageLead: true })), true);
});

test("the flag must be exactly true, not merely truthy", () => {
  // A hand-edited frontmatter can hold anything; "false" is a non-empty string.
  const dodgy = article("sport", { homepageLead: "false" as unknown as boolean });
  assert.equal(isLeadEligible(dodgy), false);
});

test("the checkbox is offered only where it would change something", () => {
  assert.equal(canPromoteToLead("sport"), true);
  assert.equal(canPromoteToLead("tech"), true);
  assert.equal(canPromoteToLead("news"), false);
  assert.equal(canPromoteToLead("features"), false);
});

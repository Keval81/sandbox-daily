import { test } from "node:test";
import assert from "node:assert/strict";
import { stripLeadingH1 } from "./strip-leading-h1";

test("removes a leading H1 and the blank line after it", () => {
  assert.equal(stripLeadingH1("# Hello World\n\nBody text."), "Body text.");
});

test("removes a leading H1 even with blank lines above it", () => {
  assert.equal(stripLeadingH1("\n\n# Title\nBody."), "Body.");
});

test("leaves a leading H2 untouched", () => {
  assert.equal(stripLeadingH1("## Subhead\n\nBody."), "## Subhead\n\nBody.");
});

test("leaves a body with no leading heading untouched", () => {
  assert.equal(stripLeadingH1("Just a paragraph.\n\nMore."), "Just a paragraph.\n\nMore.");
});

test("only strips the first H1, not a later one", () => {
  assert.equal(stripLeadingH1("# First\n\n# Second\n\nBody."), "# Second\n\nBody.");
});

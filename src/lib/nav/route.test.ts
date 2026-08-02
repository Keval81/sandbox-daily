import test from "node:test";
import assert from "node:assert/strict";
import { isFrontPage, normalisePathname } from "./route";

test("normalisePathname maps Vercel's prerendered root route back to /", () => {
  assert.equal(normalisePathname("/index"), "/");
});

test("normalisePathname leaves every other path untouched", () => {
  assert.equal(normalisePathname("/"), "/");
  assert.equal(normalisePathname("/news"), "/news");
  assert.equal(normalisePathname("/news/index-of-lies"), "/news/index-of-lies");
});

test("isFrontPage is true for the browser path and for Vercel's server path", () => {
  assert.equal(isFrontPage("/"), true);
  assert.equal(isFrontPage("/index"), true);
});

test("isFrontPage is false for every section route", () => {
  assert.equal(isFrontPage("/news"), false);
  assert.equal(isFrontPage("/pulse"), false);
  assert.equal(isFrontPage("/features/the-body-count"), false);
});

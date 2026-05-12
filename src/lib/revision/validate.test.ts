// src/lib/revision/validate.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRevisionRequestBody } from "./validate";

const VALID_BODY = {
  vertical: "sport",
  slug: "itauma-piece",
  overall_notes: "Tighten.",
  inline_comments: [],
  image: { regenerate: false, context: null },
};

test("accepts a minimally valid body", () => {
  const result = validateRevisionRequestBody(VALID_BODY);
  assert.equal(result.ok, true);
});

test("rejects missing vertical", () => {
  const result = validateRevisionRequestBody({ ...VALID_BODY, vertical: undefined });
  assert.equal(result.ok, false);
});

test("rejects unknown vertical", () => {
  const result = validateRevisionRequestBody({ ...VALID_BODY, vertical: "weather" });
  assert.equal(result.ok, false);
});

test("rejects missing slug", () => {
  const result = validateRevisionRequestBody({ ...VALID_BODY, slug: "" });
  assert.equal(result.ok, false);
});

test("rejects malformed slug", () => {
  const result = validateRevisionRequestBody({ ...VALID_BODY, slug: "../etc/passwd" });
  assert.equal(result.ok, false);
});

test("rejects body with no notes AND no comments", () => {
  const empty = {
    ...VALID_BODY,
    overall_notes: "",
    inline_comments: [],
  };
  const result = validateRevisionRequestBody(empty);
  assert.equal(result.ok, false);
});

test("accepts body with comments and no overall notes", () => {
  const withComments = {
    ...VALID_BODY,
    overall_notes: "",
    inline_comments: [
      {
        id: "c1",
        quote: "x",
        paragraph_index: 0,
        paragraph_text: "x",
        preceding_context: "",
        following_context: "",
        comment: "y",
        created_at: "2026-05-10T15:00:00.000Z",
      },
    ],
  };
  const result = validateRevisionRequestBody(withComments);
  assert.equal(result.ok, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { isSlug, isDeviceId, readSignalBody } from "./validate";

const DEVICE = "3f7c1f2e-9a55-4a7d-9a6b-2f4f1f4a0c11";

test("isSlug accepts the shape the pipeline writes", () => {
  assert.equal(isSlug("the-man-at-the-door"), true);
  assert.equal(isSlug("buying-the-ceiling"), true);
});

test("isSlug rejects traversal, quoting and PostgREST filter syntax", () => {
  for (const bad of ["../etc", 'a"b', "a,b", "a(b)", "A-Story", "", "x".repeat(121)]) {
    assert.equal(isSlug(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});

test("isDeviceId accepts a uuid and nothing else", () => {
  assert.equal(isDeviceId(DEVICE), true);
  assert.equal(isDeviceId("nope"), false);
  assert.equal(isDeviceId(42), false);
  assert.equal(isDeviceId(null), false);
});

test("readSignalBody returns the pair when both are valid", () => {
  assert.deepEqual(readSignalBody({ slug: "a-story", deviceId: DEVICE }), {
    slug: "a-story",
    deviceId: DEVICE,
  });
});

test("readSignalBody names which field failed", () => {
  assert.deepEqual(readSignalBody({ slug: "../etc", deviceId: DEVICE }), { error: "bad slug" });
  assert.deepEqual(readSignalBody({ slug: "a-story", deviceId: "x" }), { error: "bad deviceId" });
});

test("readSignalBody survives a null or garbage body", () => {
  assert.deepEqual(readSignalBody(null), { error: "bad slug" });
  assert.deepEqual(readSignalBody("not-json"), { error: "bad slug" });
});

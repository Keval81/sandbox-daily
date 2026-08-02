import test from "node:test";
import assert from "node:assert/strict";
import { operatorSurfaceEnabled } from "./surface";

test("the operator surfaces are on only when SANDBOX_ADMIN is exactly 1", () => {
  assert.equal(operatorSurfaceEnabled({ SANDBOX_ADMIN: "1" }), true);
});

test("they are off when the flag is absent — the Vercel case", () => {
  assert.equal(operatorSurfaceEnabled({}), false);
  assert.equal(operatorSurfaceEnabled({ SANDBOX_ADMIN: undefined }), false);
});

test("they are off for every near-miss value, rather than truthy-guessing", () => {
  for (const value of ["0", "", "true", "yes", "on", "TRUE", " 1"]) {
    assert.equal(
      operatorSurfaceEnabled({ SANDBOX_ADMIN: value }),
      false,
      `SANDBOX_ADMIN=${JSON.stringify(value)} must not open the operator surfaces`
    );
  }
});

test("NODE_ENV alone never opens them", () => {
  assert.equal(operatorSurfaceEnabled({ NODE_ENV: "development" }), false);
});

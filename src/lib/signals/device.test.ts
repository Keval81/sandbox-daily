import test from "node:test";
import assert from "node:assert/strict";
import { readStoredDeviceId, DEVICE_KEY } from "./device";

test("readStoredDeviceId returns a stored uuid unchanged", () => {
  const id = "3f7c1f2e-9a55-4a7d-9a6b-2f4f1f4a0c11";
  assert.equal(readStoredDeviceId({ [DEVICE_KEY]: id }), id);
});

test("readStoredDeviceId rejects anything that is not a uuid", () => {
  assert.equal(readStoredDeviceId({ [DEVICE_KEY]: "nope" }), null);
  assert.equal(readStoredDeviceId({ [DEVICE_KEY]: "" }), null);
  assert.equal(readStoredDeviceId({}), null);
});

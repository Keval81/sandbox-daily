import test from "node:test";
import assert from "node:assert/strict";
import { buildShareUrl } from "./share";

test("buildShareUrl joins origin and path", () => {
  assert.equal(buildShareUrl("https://x.com", "/news/a"), "https://x.com/news/a");
});

test("buildShareUrl tolerates a trailing slash on the origin", () => {
  assert.equal(buildShareUrl("https://x.com/", "/pulse"), "https://x.com/pulse");
});

test("buildShareUrl appends and encodes params", () => {
  assert.equal(
    buildShareUrl("https://x.com", "/pulse", { event: "eonet/EONET_1 2" }),
    "https://x.com/pulse?event=eonet%2FEONET_1+2"
  );
});

test("buildShareUrl omits the query entirely when there are no params", () => {
  assert.equal(buildShareUrl("https://x.com", "/pulse", {}), "https://x.com/pulse");
});

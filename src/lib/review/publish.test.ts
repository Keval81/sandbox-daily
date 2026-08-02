import test from "node:test";
import assert from "node:assert/strict";
import { commitMessage, needsRebaseRetry, stagedPathsFor } from "./publish";

test("stagedPathsFor names the markdown and every image that belongs to the slug", () => {
  const paths = stagedPathsFor("news", "2026-08-02-a-story.md", "a-story", [
    "a-story.png",
    "a-story-inline-1.png",
    "a-story-inline-2.webp",
    "another-story.png",
    "a-story-longer-slug.png",
  ]);
  assert.deepEqual(paths, [
    "src/content/news/2026-08-02-a-story.md",
    "public/images/articles/a-story.png",
    "public/images/articles/a-story-inline-1.png",
    "public/images/articles/a-story-inline-2.webp",
  ]);
});

test("stagedPathsFor does not claim another article whose slug merely starts the same", () => {
  // "a-story-longer-slug.png" belongs to a DIFFERENT article. Staging it would
  // publish someone else's work on this approval.
  const paths = stagedPathsFor("news", "2026-08-02-a-story.md", "a-story", ["a-story-longer-slug.png"]);
  assert.deepEqual(paths, ["src/content/news/2026-08-02-a-story.md"]);
});

test("stagedPathsFor returns just the markdown when the piece has no images", () => {
  assert.deepEqual(stagedPathsFor("tech", "2026-08-02-x.md", "x", []), ["src/content/tech/2026-08-02-x.md"]);
});

test("commitMessage leads with the headline and records how it was published", () => {
  const msg = commitMessage("Why Trump and Iran can't make the peace they both want", "news");
  assert.match(msg, /^content: publish 'Why Trump and Iran can't make the peace they both want'/);
  assert.match(msg, /approved at \/review/i);
  assert.match(msg, /news/);
});

test("commitMessage survives a headline containing quotes and newlines", () => {
  const msg = commitMessage('The "quoted" story\nwith a break', "features");
  assert.ok(!msg.includes("\n\nwith a break"), "the headline must not break the subject line");
  assert.match(msg, /The "quoted" story with a break/);
});

test("needsRebaseRetry recognises the remote-has-moved-on rejections", () => {
  for (const stderr of [
    "! [rejected]        main -> main (fetch first)",
    "! [rejected]        main -> main (non-fast-forward)",
    "Updates were rejected because the remote contains work that you do not have locally.",
  ]) {
    assert.equal(needsRebaseRetry(stderr), true, stderr);
  }
});

test("needsRebaseRetry does not rebase on failures a rebase cannot fix", () => {
  for (const stderr of [
    "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    "fatal: unable to access 'https://github.com/x.git/': Could not resolve host: github.com",
    "error: failed to push some refs: permission denied",
  ]) {
    assert.equal(needsRebaseRetry(stderr), false, stderr);
  }
});

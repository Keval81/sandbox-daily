import { test } from "node:test";
import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveWorkflowFile, moveToSocialReady } from "./actions";

test("moveToSocialReady moves an eligible article into the matching social-ready folder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-action-"));
  try {
    const outputsRoot = join(dir, "ssnn-outputs");
    const publishedDir = join(outputsRoot, "articles/published/sports");
    const sourcePath = join(publishedDir, "2026-05-16-liverpool.md");
    await mkdir(publishedDir, { recursive: true });
    await writeFile(
      sourcePath,
      "---\ntitle: Liverpool\ncategory: sports\n---\n\nBody",
      "utf-8"
    );

    const result = await moveToSocialReady({
      outputsRoot,
      articlePath: sourcePath,
      vertical: "sport",
    });

    assert.equal(result.ok, true);
    assert.equal(
      result.destinationPath,
      join(
        outputsRoot,
        "articles/social-ready/sports",
        "2026-05-16-liverpool.md"
      )
    );
    assert.equal(
      await readFile(result.destinationPath, "utf-8"),
      "---\ntitle: Liverpool\ncategory: sports\n---\n\nBody"
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("moveToSocialReady rejects paths outside the published folder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-action-invalid-"));
  try {
    const outputsRoot = join(dir, "ssnn-outputs");
    const sourcePath = join(outputsRoot, "research-docs/story.md");
    await mkdir(join(outputsRoot, "research-docs"), { recursive: true });
    await writeFile(sourcePath, "Body", "utf-8");

    await assert.rejects(
      () =>
        moveToSocialReady({
          outputsRoot,
          articlePath: sourcePath,
          vertical: "sport",
        }),
      /not inside articles\/published/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("archiveWorkflowFile moves an eligible pipeline file with a reason", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-archive-"));
  try {
    const outputsRoot = join(dir, "ssnn-outputs");
    const sourcePath = join(
      outputsRoot,
      "research-docs",
      "2026-05-18-unused-research.md"
    );
    await mkdir(join(outputsRoot, "research-docs"), { recursive: true });
    await writeFile(sourcePath, "Unused research", "utf-8");

    const result = await archiveWorkflowFile({
      outputsRoot,
      filePath: sourcePath,
      reason: "not using",
    });

    assert.equal(result.ok, true);
    assert.equal(
      result.destinationPath,
      join(
        outputsRoot,
        "archive/research-docs",
        "2026-05-18-unused-research.md"
      )
    );
    assert.equal(await readFile(result.destinationPath, "utf-8"), "Unused research");
    const metadata = JSON.parse(
      await readFile(`${result.destinationPath}.archive.json`, "utf-8")
    );
    assert.equal(metadata.reason, "not using");
    await assert.rejects(() => access(sourcePath), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("archiveWorkflowFile rejects site content and blank reasons", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-archive-invalid-"));
  try {
    const outputsRoot = join(dir, "ssnn-outputs");
    const siteArticlePath = join(dir, "site/src/content/news/story.md");
    await mkdir(join(dir, "site/src/content/news"), { recursive: true });
    await writeFile(siteArticlePath, "Published", "utf-8");

    await assert.rejects(
      () =>
        archiveWorkflowFile({
          outputsRoot,
          filePath: siteArticlePath,
          reason: "not using",
        }),
      /eligible pipeline folder/
    );
    await assert.rejects(
      () =>
        archiveWorkflowFile({
          outputsRoot,
          filePath: join(outputsRoot, "research-docs/story.md"),
          reason: " ",
        }),
      /Archive reason is required/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

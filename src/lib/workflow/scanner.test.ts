import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanWorkflowDashboard } from "./scanner";

async function writeMarkdown(
  filePath: string,
  frontmatter: string,
  body = "Body"
): Promise<void> {
  await writeFile(filePath, `---\n${frontmatter}---\n\n${body}`, "utf-8");
}

test("scanWorkflowDashboard derives story stages, exceptions, and summaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-scan-"));
  try {
    const outputsRoot = join(dir, "ssnn-outputs");
    const siteRoot = join(dir, "site");

    await mkdir(join(outputsRoot, "research-docs"), { recursive: true });
    await mkdir(join(outputsRoot, "research-docs-features"), {
      recursive: true,
    });
    await mkdir(join(outputsRoot, "articles/published/features"), {
      recursive: true,
    });
    await mkdir(join(outputsRoot, "articles/social-ready/features"), {
      recursive: true,
    });
    await mkdir(join(outputsRoot, "review-jobs"), { recursive: true });
    await mkdir(join(siteRoot, "src/content/features"), { recursive: true });
    await mkdir(join(siteRoot, "src/content/sport"), { recursive: true });

    await writeMarkdown(
      join(outputsRoot, "research-docs", "2026-05-16-ai-agents-research.md"),
      "title: AI Agents\ncategory: tech\n"
    );
    await writeMarkdown(
      join(
        outputsRoot,
        "research-docs-features",
        "2026-05-01-nikola-tesla-deep-spotlight-profile-research.md"
      ),
      "title: Nikola Tesla\nfeature_type: spotlight\ncategory: features\n"
    );
    await writeMarkdown(
      join(outputsRoot, "articles/published/features", "2026-05-14-biodiversity.md"),
      "title: Biodiversity\nslug: biodiversity\ncategory: features\n"
    );
    await writeMarkdown(
      join(siteRoot, "src/content/sport", "2026-05-16-liverpool.md"),
      "title: Liverpool\nslug: liverpool\ncategory: sport\nstatus: pending\ndate: 2026-05-16\n"
    );
    await writeMarkdown(
      join(siteRoot, "src/content/features", "2026-05-15-arson.md"),
      "title: Arson\nslug: arson\ncategory: features\nstatus: revision-requested\ndate: 2026-05-15\n"
    );
    await writeFile(
      join(outputsRoot, "review-jobs", "job-arson.json"),
      JSON.stringify({
        id: "job-arson",
        slug: "arson",
        vertical: "features",
        status: "error",
        current_step: "validating",
        started_at: "2026-05-16T10:00:00.000Z",
        updated_at: "2026-05-16T10:01:00.000Z",
        error: "Validation failed",
        log_path: "/tmp/job-arson.log",
      }),
      "utf-8"
    );

    const data = await scanWorkflowDashboard({
      outputsRoot,
      siteRoot,
      now: new Date("2026-05-16T12:00:00.000Z"),
    });

    assert.equal(
      data.stories.some((story) => story.slug.includes("ai-agents-research")),
      true
    );
    assert.equal(
      data.stories.find((story) => story.title === "Nikola Tesla")?.type,
      "spotlight"
    );
    assert.equal(
      data.stories.find((story) => story.slug === "biodiversity")?.stage,
      "ready-image"
    );
    assert.equal(
      data.stories.find((story) => story.slug === "liverpool")?.stage,
      "human-review"
    );
    assert.equal(
      data.stories.find((story) => story.slug === "arson")?.health,
      "error"
    );
    assert.equal(data.summary.manualMoves, 1);
    assert.equal(data.summary.actionable, 3);
    assert.equal(data.summary.needsAttention >= 1, true);
    assert.equal(data.exceptions.some((item) => item.title === "Arson"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scanWorkflowDashboard excludes archived research and already imaged articles from active counts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-scan-filter-"));
  try {
    const outputsRoot = join(dir, "ssnn-outputs");
    const siteRoot = join(dir, "site");
    const now = new Date("2026-05-18T12:00:00.000Z");

    await mkdir(join(outputsRoot, "research-docs"), { recursive: true });
    await mkdir(join(outputsRoot, "research-docs-features"), {
      recursive: true,
    });
    await mkdir(join(outputsRoot, "articles/published/news"), {
      recursive: true,
    });
    await mkdir(join(outputsRoot, "articles/published/.image-processed"), {
      recursive: true,
    });
    await mkdir(join(outputsRoot, "review-jobs"), { recursive: true });
    await mkdir(join(siteRoot, "src/content/news"), { recursive: true });

    const oldResearch = join(
      outputsRoot,
      "research-docs",
      "2026-04-01-old-source-research.md"
    );
    await writeMarkdown(oldResearch, "title: Old Source\ncategory: news\n");
    await utimes(
      oldResearch,
      new Date("2026-04-01T10:00:00.000Z"),
      new Date("2026-04-01T10:00:00.000Z")
    );

    await writeMarkdown(
      join(outputsRoot, "research-docs", "2026-05-18-new-source-research.md"),
      "title: New Source\ncategory: news\n"
    );

    await writeMarkdown(
      join(outputsRoot, "articles/published/news", "2026-05-14-already-live.md"),
      "title: Already Live\nslug: already-live\ncategory: news\n"
    );
    await writeMarkdown(
      join(outputsRoot, "articles/published/.image-processed", "2026-05-14-already-live.md"),
      "title: Already Live\nslug: already-live\ncategory: news\n"
    );
    await writeMarkdown(
      join(siteRoot, "src/content/news", "2026-05-14-already-live.md"),
      "title: Already Live\nslug: already-live\ncategory: news\nstatus: published\ndate: 2026-05-14\n"
    );

    const data = await scanWorkflowDashboard({ outputsRoot, siteRoot, now });

    assert.equal(
      data.stories.some((story) => story.title === "Old Source"),
      false
    );
    assert.equal(
      data.stories.find((story) => story.title === "New Source")?.stage,
      "research"
    );
    assert.equal(
      data.stories.some(
        (story) => story.title === "Already Live" && story.stage === "ready-image"
      ),
      false
    );
    assert.equal(data.summary.manualMoves, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scanWorkflowDashboard excludes research that has already produced a published article", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-scan-state-"));
  try {
    const outputsRoot = join(dir, "ssnn-outputs");
    const siteRoot = join(dir, "site");
    const now = new Date("2026-05-18T12:00:00.000Z");

    await mkdir(join(outputsRoot, "research-docs"), { recursive: true });
    await mkdir(join(outputsRoot, "research-docs-features"), {
      recursive: true,
    });
    await mkdir(join(outputsRoot, "articles"), { recursive: true });
    await mkdir(join(outputsRoot, "articles/published"), { recursive: true });
    await mkdir(join(outputsRoot, "articles/social-ready"), { recursive: true });
    await mkdir(join(outputsRoot, "review-jobs"), { recursive: true });
    await mkdir(join(siteRoot, "src/content/features"), { recursive: true });

    await writeFile(
      join(
        outputsRoot,
        "research-docs-features",
        "2026-05-14-new-york-cemetery-bees-biodiversity-feature-research.md"
      ),
      [
        "# Feature Research: New York cemetery bees biodiversity",
        "",
        "**Focus:** Millions of ground-nesting bees living beneath a cemetery.",
      ].join("\n"),
      "utf-8"
    );
    await writeFile(
      join(outputsRoot, "articles", "articles-state.json"),
      JSON.stringify({
        processed: {
          "2026-05-14-new-york-cemetery-bees-biodiversity-feature-research.md": {
            article: "2026-05-14-the-dead-did-more-for-biodiversity-than-the-living.md",
            editorial_decision: "write",
          },
        },
      }),
      "utf-8"
    );
    await writeMarkdown(
      join(
        siteRoot,
        "src/content/features",
        "2026-05-14-the-dead-did-more-for-biodiversity-than-the-living.md"
      ),
      "title: The Dead Did More for Biodiversity Than the Living\nslug: the-dead-did-more-for-biodiversity-than-the-living\ncategory: features\nstatus: published\ndate: 2026-05-14\n"
    );

    const data = await scanWorkflowDashboard({ outputsRoot, siteRoot, now });

    assert.equal(
      data.stories.some((story) =>
        story.slug.includes("new-york-cemetery-bees-biodiversity")
      ),
      false
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scanWorkflowDashboard exposes archived files outside active counts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-scan-archive-"));
  try {
    const outputsRoot = join(dir, "ssnn-outputs");
    const siteRoot = join(dir, "site");

    await mkdir(join(outputsRoot, "archive/research-docs"), { recursive: true });
    await mkdir(join(outputsRoot, "research-docs"), { recursive: true });
    await mkdir(join(outputsRoot, "research-docs-features"), {
      recursive: true,
    });
    await mkdir(join(outputsRoot, "articles/published"), { recursive: true });
    await mkdir(join(outputsRoot, "articles/social-ready"), { recursive: true });
    await mkdir(join(outputsRoot, "review-jobs"), { recursive: true });
    await mkdir(join(siteRoot, "src/content/news"), { recursive: true });

    const archivePath = join(
      outputsRoot,
      "archive/research-docs",
      "2026-05-18-unused-research.md"
    );
    await writeMarkdown(archivePath, "title: Unused Research\ncategory: news\n");
    await writeFile(
      `${archivePath}.archive.json`,
      JSON.stringify({
        reason: "not using",
        archivedAt: "2026-05-18T10:00:00.000Z",
      }),
      "utf-8"
    );

    const data = await scanWorkflowDashboard({
      outputsRoot,
      siteRoot,
      now: new Date("2026-05-18T12:00:00.000Z"),
    });

    assert.equal(data.summary.inFlight, 0);
    assert.equal(data.archived.length, 1);
    assert.equal(data.archived[0]?.title, "Unused Research");
    assert.equal(data.archived[0]?.reason, "not using");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scanWorkflowDashboard ignores stale failed review jobs when a newer job passed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-scan-latest-job-"));
  try {
    const outputsRoot = join(dir, "ssnn-outputs");
    const siteRoot = join(dir, "site");

    await mkdir(join(outputsRoot, "research-docs"), { recursive: true });
    await mkdir(join(outputsRoot, "research-docs-features"), {
      recursive: true,
    });
    await mkdir(join(outputsRoot, "articles/published"), { recursive: true });
    await mkdir(join(outputsRoot, "articles/social-ready"), { recursive: true });
    await mkdir(join(outputsRoot, "review-jobs"), { recursive: true });
    await mkdir(join(siteRoot, "src/content/sport"), { recursive: true });

    await writeMarkdown(
      join(siteRoot, "src/content/sport", "2026-05-10-itauma.md"),
      "title: Itauma\nslug: itauma\ncategory: sports\nstatus: published\ndate: 2026-05-10\n"
    );
    await writeFile(
      join(outputsRoot, "review-jobs", "old-error.json"),
      JSON.stringify({
        id: "old-error",
        slug: "itauma",
        vertical: "sport",
        status: "error",
        current_step: "validating",
        started_at: "2026-05-12T10:00:00.000Z",
        updated_at: "2026-05-12T10:01:00.000Z",
        error: "Old failure",
        log_path: "/tmp/old-error.log",
      }),
      "utf-8"
    );
    await writeFile(
      join(outputsRoot, "review-jobs", "new-done.json"),
      JSON.stringify({
        id: "new-done",
        slug: "itauma",
        vertical: "sport",
        status: "done",
        current_step: "complete",
        started_at: "2026-05-14T10:00:00.000Z",
        updated_at: "2026-05-14T10:01:00.000Z",
        error: null,
        log_path: "/tmp/new-done.log",
      }),
      "utf-8"
    );

    const data = await scanWorkflowDashboard({
      outputsRoot,
      siteRoot,
      now: new Date("2026-05-18T12:00:00.000Z"),
    });

    const story = data.stories.find((item) => item.slug === "itauma");
    assert.equal(story?.stage, "published");
    assert.equal(story?.health, "ok");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scanWorkflowDashboard places pending feature articles in the feature lane", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-scan-feature-lane-"));
  try {
    const outputsRoot = join(dir, "ssnn-outputs");
    const siteRoot = join(dir, "site");

    await mkdir(join(outputsRoot, "research-docs"), { recursive: true });
    await mkdir(join(outputsRoot, "research-docs-features"), {
      recursive: true,
    });
    await mkdir(join(outputsRoot, "articles/published"), { recursive: true });
    await mkdir(join(outputsRoot, "articles/social-ready"), { recursive: true });
    await mkdir(join(outputsRoot, "review-jobs"), { recursive: true });
    await mkdir(join(siteRoot, "src/content/features"), { recursive: true });

    await writeMarkdown(
      join(siteRoot, "src/content/features", "2026-05-18-feature.md"),
      "title: Feature Story\nslug: feature-story\ncategory: features\nstatus: pending\ndate: 2026-05-18\n"
    );

    const data = await scanWorkflowDashboard({
      outputsRoot,
      siteRoot,
      now: new Date("2026-05-18T12:00:00.000Z"),
    });

    const story = data.stories.find((item) => item.slug === "feature-story");
    assert.equal(story?.stage, "human-review");
    assert.equal(story?.type, "feature");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

# Workflow Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/admin/workflow`, a local-only content control room that reads real Sandbox Daily filesystem pipeline state and exposes safe operational actions.

**Architecture:** Implement a server-side workflow scanner under `src/lib/workflow` that normalizes filesystem and agent state into a derived `WorkflowStory` view model. Add focused route handlers for safe mutations, then render a mostly server-driven admin page with a small client component for filters and actions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, Node filesystem APIs, `node:test`, existing `gray-matter`, existing `lucide-react`.

**Commit Policy:** Do not commit during execution unless SanSan explicitly asks. Each task still ends with a verification checkpoint and a precise `git status --short`.

---

## File Structure

Create:

- `src/lib/workflow/types.ts` — workflow enums, normalized story/action types, scanner result types.
- `src/lib/workflow/paths.ts` — configurable root paths for `ssnn-outputs` and site folders.
- `src/lib/workflow/metadata.ts` — small frontmatter/title/slug helpers shared by scanner modules.
- `src/lib/workflow/state-readers.ts` — tolerant JSON readers for writer/editor/image/review state.
- `src/lib/workflow/stage-inference.ts` — pure functions that infer story type, vertical, stage, health, actions, and exceptions.
- `src/lib/workflow/scanner.ts` — orchestrates directory reads and returns the full dashboard view model.
- `src/lib/workflow/actions.ts` — safe server-side operations such as `moveToSocialReady`.
- `src/lib/workflow/*.test.ts` — focused tests for metadata, stage inference, scanner, and actions.
- `src/app/admin/layout.tsx` — admin shell/navigation for workflow now and engagement later.
- `src/app/admin/workflow/page.tsx` — dynamic server page for the dashboard.
- `src/app/admin/workflow/WorkflowDashboard.tsx` — client component for filters and action forms.
- `src/app/admin/workflow/actions.ts` — server actions for move/retry where practical.
- `src/app/api/admin/workflow/move-to-social-ready/route.ts` — local-only action endpoint if server actions need a route fallback.

Modify:

- `src/lib/types.ts` only if `Vertical` needs `spotlights`; prefer keeping workflow-specific vertical types in `src/lib/workflow/types.ts`.
- `src/lib/revision/jobs.ts` only if retry needs a small exported helper already implied by existing behavior.
- `.gitignore` only if additional local-only workflow artifacts appear.

Do not modify:

- public article listing behavior
- review approve/reject semantics
- writer/editor/image/reviser agents
- Grok/X virality surfaces

---

### Task 1: Define Workflow Types

**Files:**
- Create: `src/lib/workflow/types.ts`
- Test: `src/lib/workflow/types.test.ts`

- [ ] **Step 1: Write the failing type/runtime test**

Create `src/lib/workflow/types.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isWorkflowAction,
  WORKFLOW_ACTIONS,
  WORKFLOW_STAGES,
  WORKFLOW_TYPES,
} from "./types";

test("workflow constants expose the supported MVP stages, story types, and actions", () => {
  assert.deepEqual(WORKFLOW_TYPES, ["normal", "feature", "spotlight"]);
  assert.deepEqual(WORKFLOW_STAGES, [
    "research",
    "writer",
    "editor",
    "ready-image",
    "image-agent",
    "human-review",
    "revision",
    "published",
  ]);
  assert.deepEqual(WORKFLOW_ACTIONS, [
    "open-source",
    "open-review",
    "open-logs",
    "retry-failed-job",
    "move-to-social-ready",
  ]);
});

test("isWorkflowAction accepts only supported action identifiers", () => {
  assert.equal(isWorkflowAction("open-source"), true);
  assert.equal(isWorkflowAction("move-to-social-ready"), true);
  assert.equal(isWorkflowAction("run-writer-agent"), false);
  assert.equal(isWorkflowAction(null), false);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:lib -- src/lib/workflow/types.test.ts
```

Expected: fails because `src/lib/workflow/types.ts` does not exist.

- [ ] **Step 3: Implement workflow types**

Create `src/lib/workflow/types.ts`:

```ts
export const WORKFLOW_TYPES = ["normal", "feature", "spotlight"] as const;
export type WorkflowStoryType = (typeof WORKFLOW_TYPES)[number];

export const WORKFLOW_VERTICALS = [
  "news",
  "tech",
  "sport",
  "features",
  "review",
  "spotlights",
  "unknown",
] as const;
export type WorkflowVertical = (typeof WORKFLOW_VERTICALS)[number];

export const WORKFLOW_STAGES = [
  "research",
  "writer",
  "editor",
  "ready-image",
  "image-agent",
  "human-review",
  "revision",
  "published",
] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const WORKFLOW_HEALTH = ["ok", "stale", "warning", "error"] as const;
export type WorkflowHealth = (typeof WORKFLOW_HEALTH)[number];

export const WORKFLOW_ACTIONS = [
  "open-source",
  "open-review",
  "open-logs",
  "retry-failed-job",
  "move-to-social-ready",
] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

export function isWorkflowAction(value: unknown): value is WorkflowAction {
  return typeof value === "string" && WORKFLOW_ACTIONS.includes(value as WorkflowAction);
}

export interface WorkflowStory {
  id: string;
  slug: string;
  title: string;
  type: WorkflowStoryType;
  vertical: WorkflowVertical;
  stage: WorkflowStage;
  health: WorkflowHealth;
  ageLabel: string;
  updatedAt: string | null;
  sourcePath?: string;
  articlePath?: string;
  reviewPath?: string;
  logPath?: string;
  latestError?: string;
  availableActions: WorkflowAction[];
}

export interface WorkflowStageSummary {
  stage: WorkflowStage;
  count: number;
  health: WorkflowHealth;
  detail: string;
}

export interface WorkflowException {
  id: string;
  storyId: string;
  stage: WorkflowStage;
  health: Exclude<WorkflowHealth, "ok">;
  title: string;
  detail: string;
  ageLabel: string;
  action?: WorkflowAction;
}

export interface WorkflowSummary {
  needsAttention: number;
  manualMoves: number;
  inFlight: number;
  liveToday: number;
}

export interface WorkflowDashboardData {
  generatedAt: string;
  summary: WorkflowSummary;
  stages: WorkflowStageSummary[];
  stories: WorkflowStory[];
  exceptions: WorkflowException[];
  warnings: string[];
}
```

- [ ] **Step 4: Run the test**

Run:

```bash
npm run test:lib -- src/lib/workflow/types.test.ts
```

Expected: passes.

- [ ] **Step 5: Verification checkpoint**

Run:

```bash
git status --short
```

Expected: new `src/lib/workflow/types.ts` and `src/lib/workflow/types.test.ts`.

---

### Task 2: Add Configurable Workflow Paths

**Files:**
- Create: `src/lib/workflow/paths.ts`
- Test: `src/lib/workflow/paths.test.ts`

- [ ] **Step 1: Write the failing paths test**

Create `src/lib/workflow/paths.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorkflowPaths } from "./paths";

test("buildWorkflowPaths uses the supplied roots", () => {
  const paths = buildWorkflowPaths({
    outputsRoot: "/tmp/ssnn-outputs",
    siteRoot: "/tmp/site",
  });

  assert.equal(paths.researchDocsRoot, "/tmp/ssnn-outputs/research-docs");
  assert.equal(paths.featureResearchDocsRoot, "/tmp/ssnn-outputs/research-docs-features");
  assert.equal(paths.articlesRoot, "/tmp/ssnn-outputs/articles");
  assert.equal(paths.reviewJobsRoot, "/tmp/ssnn-outputs/review-jobs");
  assert.equal(paths.siteContentRoot, "/tmp/site/src/content");
  assert.equal(paths.siteImagesRoot, "/tmp/site/public/images/articles");
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:lib -- src/lib/workflow/paths.test.ts
```

Expected: fails because `paths.ts` does not exist.

- [ ] **Step 3: Implement workflow paths**

Create `src/lib/workflow/paths.ts`:

```ts
import path from "node:path";

const HOME = process.env.HOME ?? "/Users/sandboxsansan";

export interface WorkflowRootInput {
  outputsRoot?: string;
  siteRoot?: string;
}

export interface WorkflowPaths {
  outputsRoot: string;
  siteRoot: string;
  researchDocsRoot: string;
  featureResearchDocsRoot: string;
  articlesRoot: string;
  publishedRoot: string;
  socialReadyRoot: string;
  writerAgentRoot: string;
  editorAgentRoot: string;
  imageAgentRoot: string;
  reviewJobsRoot: string;
  reviewRequestsRoot: string;
  siteContentRoot: string;
  siteImagesRoot: string;
}

export function buildWorkflowPaths(input: WorkflowRootInput = {}): WorkflowPaths {
  const outputsRoot =
    input.outputsRoot ??
    process.env.SSNN_OUTPUTS_ROOT ??
    path.join(HOME, "Desktop/ssnn-outputs");
  const siteRoot = input.siteRoot ?? process.cwd();

  return {
    outputsRoot,
    siteRoot,
    researchDocsRoot: path.join(outputsRoot, "research-docs"),
    featureResearchDocsRoot: path.join(outputsRoot, "research-docs-features"),
    articlesRoot: path.join(outputsRoot, "articles"),
    publishedRoot: path.join(outputsRoot, "articles/published"),
    socialReadyRoot: path.join(outputsRoot, "articles/social-ready"),
    writerAgentRoot: path.join(outputsRoot, "writer-agent"),
    editorAgentRoot: path.join(outputsRoot, "editor-agent"),
    imageAgentRoot: path.join(outputsRoot, "image-agent"),
    reviewJobsRoot: path.join(outputsRoot, "review-jobs"),
    reviewRequestsRoot: path.join(outputsRoot, "review-requests"),
    siteContentRoot: path.join(siteRoot, "src/content"),
    siteImagesRoot: path.join(siteRoot, "public/images/articles"),
  };
}

export const WORKFLOW_PATHS = buildWorkflowPaths();
```

- [ ] **Step 4: Run the paths test**

Run:

```bash
npm run test:lib -- src/lib/workflow/paths.test.ts
```

Expected: passes.

- [ ] **Step 5: Verification checkpoint**

Run:

```bash
git status --short
```

Expected: Task 1 and Task 2 files are present.

---

### Task 3: Parse Markdown Metadata

**Files:**
- Create: `src/lib/workflow/metadata.ts`
- Test: `src/lib/workflow/metadata.test.ts`

- [ ] **Step 1: Write the failing metadata test**

Create `src/lib/workflow/metadata.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { inferSlugFromFilename, parseWorkflowMarkdown } from "./metadata";

test("inferSlugFromFilename strips markdown extension", () => {
  assert.equal(
    inferSlugFromFilename("2026-05-16-the-season-liverpool-forgot-how-to-be-liverpool.md"),
    "2026-05-16-the-season-liverpool-forgot-how-to-be-liverpool"
  );
});

test("parseWorkflowMarkdown reads title, slug, category, status, and spotlight signals", () => {
  const parsed = parseWorkflowMarkdown(
    `---
title: The Man Who Lit The World
slug: the-man-who-lit-the-world
category: features
status: pending
feature_type: spotlight
subject_name: Nikola Tesla
date: 2026-05-01
---

Body text`
  );

  assert.equal(parsed.title, "The Man Who Lit The World");
  assert.equal(parsed.slug, "the-man-who-lit-the-world");
  assert.equal(parsed.category, "features");
  assert.equal(parsed.status, "pending");
  assert.equal(parsed.featureType, "spotlight");
  assert.equal(parsed.subjectName, "Nikola Tesla");
  assert.equal(parsed.date, "2026-05-01");
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:lib -- src/lib/workflow/metadata.test.ts
```

Expected: fails because `metadata.ts` does not exist.

- [ ] **Step 3: Implement metadata helpers**

Create `src/lib/workflow/metadata.ts`:

```ts
import matter from "gray-matter";

export interface WorkflowMarkdownMetadata {
  title: string | null;
  slug: string | null;
  category: string | null;
  status: string | null;
  featureType: string | null;
  subjectName: string | null;
  date: string | null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function inferSlugFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, "");
}

export function titleFromSlug(slug: string): string {
  return slug
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function parseWorkflowMarkdown(raw: string): WorkflowMarkdownMetadata {
  const { data } = matter(raw);
  const rawDate = data.date;

  return {
    title: stringOrNull(data.title),
    slug: stringOrNull(data.slug),
    category: stringOrNull(data.category),
    status: stringOrNull(data.status),
    featureType: stringOrNull(data.feature_type),
    subjectName: stringOrNull(data.subject_name),
    date:
      typeof rawDate === "string"
        ? rawDate
        : rawDate instanceof Date
          ? rawDate.toISOString()
          : null,
  };
}
```

- [ ] **Step 4: Run the metadata test**

Run:

```bash
npm run test:lib -- src/lib/workflow/metadata.test.ts
```

Expected: passes.

- [ ] **Step 5: Verification checkpoint**

Run:

```bash
git status --short
```

Expected: metadata files added.

---

### Task 4: Implement Stage Inference

**Files:**
- Create: `src/lib/workflow/stage-inference.ts`
- Test: `src/lib/workflow/stage-inference.test.ts`

- [ ] **Step 1: Write the failing stage inference test**

Create `src/lib/workflow/stage-inference.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAvailableActions,
  inferHealth,
  inferStoryType,
  normalizeVertical,
} from "./stage-inference";

test("inferStoryType distinguishes normal, feature, and spotlight", () => {
  assert.equal(inferStoryType({ sourceRootKind: "research", filename: "x.md" }), "normal");
  assert.equal(inferStoryType({ sourceRootKind: "feature-research", filename: "x.md" }), "feature");
  assert.equal(
    inferStoryType({
      sourceRootKind: "feature-research",
      filename: "2026-05-01-nikola-tesla-deep-spotlight-profile-research.md",
      featureType: null,
    }),
    "spotlight"
  );
  assert.equal(
    inferStoryType({
      sourceRootKind: "feature-research",
      filename: "x.md",
      featureType: "spotlight",
    }),
    "spotlight"
  );
});

test("normalizeVertical maps pipeline categories to dashboard verticals", () => {
  assert.equal(normalizeVertical("sports"), "sport");
  assert.equal(normalizeVertical("sport"), "sport");
  assert.equal(normalizeVertical("features"), "features");
  assert.equal(normalizeVertical("spotlights"), "spotlights");
  assert.equal(normalizeVertical(null), "unknown");
});

test("inferHealth escalates errors above stale warnings", () => {
  assert.equal(inferHealth({ latestError: "failed", isStale: true }), "error");
  assert.equal(inferHealth({ latestError: null, isStale: true }), "stale");
  assert.equal(inferHealth({ latestError: null, isStale: false, hasWarning: true }), "warning");
  assert.equal(inferHealth({ latestError: null, isStale: false }), "ok");
});

test("buildAvailableActions exposes only safe actions for each story state", () => {
  assert.deepEqual(
    buildAvailableActions({
      sourcePath: "/tmp/research.md",
      reviewPath: null,
      logPath: null,
      canRetry: false,
      canMoveToSocialReady: false,
    }),
    ["open-source"]
  );
  assert.deepEqual(
    buildAvailableActions({
      sourcePath: "/tmp/research.md",
      reviewPath: "/review/sport/story",
      logPath: "/tmp/job.log",
      canRetry: true,
      canMoveToSocialReady: true,
    }),
    ["open-source", "open-review", "open-logs", "retry-failed-job", "move-to-social-ready"]
  );
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:lib -- src/lib/workflow/stage-inference.test.ts
```

Expected: fails because `stage-inference.ts` does not exist.

- [ ] **Step 3: Implement inference helpers**

Create `src/lib/workflow/stage-inference.ts`:

```ts
import type { WorkflowAction, WorkflowHealth, WorkflowStoryType, WorkflowVertical } from "./types";

export interface InferStoryTypeInput {
  sourceRootKind: "research" | "feature-research";
  filename: string;
  featureType?: string | null;
}

export function inferStoryType(input: InferStoryTypeInput): WorkflowStoryType {
  const lowerFilename = input.filename.toLowerCase();
  if (input.featureType === "spotlight" || lowerFilename.includes("spotlight")) {
    return "spotlight";
  }
  return input.sourceRootKind === "feature-research" ? "feature" : "normal";
}

export function normalizeVertical(category: string | null | undefined): WorkflowVertical {
  if (category === "sports") return "sport";
  if (category === "sport") return "sport";
  if (category === "news") return "news";
  if (category === "tech") return "tech";
  if (category === "features") return "features";
  if (category === "review") return "review";
  if (category === "spotlights") return "spotlights";
  return "unknown";
}

export interface InferHealthInput {
  latestError?: string | null;
  isStale: boolean;
  hasWarning?: boolean;
}

export function inferHealth(input: InferHealthInput): WorkflowHealth {
  if (input.latestError) return "error";
  if (input.isStale) return "stale";
  if (input.hasWarning) return "warning";
  return "ok";
}

export interface BuildAvailableActionsInput {
  sourcePath?: string | null;
  reviewPath?: string | null;
  logPath?: string | null;
  canRetry: boolean;
  canMoveToSocialReady: boolean;
}

export function buildAvailableActions(input: BuildAvailableActionsInput): WorkflowAction[] {
  const actions: WorkflowAction[] = [];
  if (input.sourcePath) actions.push("open-source");
  if (input.reviewPath) actions.push("open-review");
  if (input.logPath) actions.push("open-logs");
  if (input.canRetry) actions.push("retry-failed-job");
  if (input.canMoveToSocialReady) actions.push("move-to-social-ready");
  return actions;
}
```

- [ ] **Step 4: Run the inference test**

Run:

```bash
npm run test:lib -- src/lib/workflow/stage-inference.test.ts
```

Expected: passes.

- [ ] **Step 5: Verification checkpoint**

Run:

```bash
git status --short
```

Expected: stage inference files added.

---

### Task 5: Add Tolerant State Readers

**Files:**
- Create: `src/lib/workflow/state-readers.ts`
- Test: `src/lib/workflow/state-readers.test.ts`

- [ ] **Step 1: Write the failing state-reader test**

Create `src/lib/workflow/state-readers.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJsonFile, readReviewJobs } from "./state-readers";

test("readJsonFile returns data for valid JSON and a warning for malformed JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-json-"));
  try {
    const validPath = join(dir, "valid.json");
    const invalidPath = join(dir, "invalid.json");
    await writeFile(validPath, JSON.stringify({ ok: true }), "utf-8");
    await writeFile(invalidPath, "{ nope", "utf-8");

    const valid = await readJsonFile<{ ok: boolean }>(validPath);
    const invalid = await readJsonFile(invalidPath);

    assert.deepEqual(valid.data, { ok: true });
    assert.equal(valid.warning, null);
    assert.equal(invalid.data, null);
    assert.match(invalid.warning ?? "", /Malformed JSON/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readReviewJobs loads valid job records and warns on malformed records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-jobs-"));
  try {
    const jobsRoot = join(dir, "review-jobs");
    await mkdir(jobsRoot, { recursive: true });
    await writeFile(
      join(jobsRoot, "job-1.json"),
      JSON.stringify({
        id: "job-1",
        slug: "story",
        vertical: "sport",
        status: "error",
        current_step: "validating",
        started_at: "2026-05-16T10:00:00.000Z",
        updated_at: "2026-05-16T10:01:00.000Z",
        error: "Failed validation",
        log_path: "/tmp/job-1.log",
      }),
      "utf-8"
    );
    await writeFile(join(jobsRoot, "broken.json"), "{ nope", "utf-8");

    const result = await readReviewJobs(jobsRoot);

    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0]?.slug, "story");
    assert.equal(result.warnings.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:lib -- src/lib/workflow/state-readers.test.ts
```

Expected: fails because `state-readers.ts` does not exist.

- [ ] **Step 3: Implement tolerant state readers**

Create `src/lib/workflow/state-readers.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import type { JobRecord } from "@/lib/revision/types";

export interface JsonReadResult<T> {
  data: T | null;
  warning: string | null;
}

export async function readJsonFile<T = unknown>(filePath: string): Promise<JsonReadResult<T>> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return { data: JSON.parse(raw) as T, warning: null };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : null;
    if (code === "ENOENT") return { data: null, warning: null };
    const message = error instanceof SyntaxError ? "Malformed JSON" : "Failed to read JSON";
    return { data: null, warning: `${message}: ${filePath}` };
  }
}

export interface ReviewJobsReadResult {
  jobs: JobRecord[];
  warnings: string[];
}

function isJobRecord(value: unknown): value is JobRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<JobRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.slug === "string" &&
    typeof record.vertical === "string" &&
    (record.status === "queued" ||
      record.status === "running" ||
      record.status === "done" ||
      record.status === "error") &&
    typeof record.updated_at === "string" &&
    typeof record.log_path === "string"
  );
}

export async function readReviewJobs(jobsRoot: string): Promise<ReviewJobsReadResult> {
  const warnings: string[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(jobsRoot);
  } catch {
    return { jobs: [], warnings: [`Review jobs folder not found: ${jobsRoot}`] };
  }

  const jobs: JobRecord[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const filePath = path.join(jobsRoot, entry);
    const result = await readJsonFile<JobRecord>(filePath);
    if (result.warning) {
      warnings.push(result.warning);
      continue;
    }
    if (!isJobRecord(result.data)) {
      warnings.push(`Invalid review job shape: ${filePath}`);
      continue;
    }
    jobs.push(result.data);
  }

  return { jobs, warnings };
}
```

- [ ] **Step 4: Run state-reader tests**

Run:

```bash
npm run test:lib -- src/lib/workflow/state-readers.test.ts
```

Expected: passes.

- [ ] **Step 5: Verification checkpoint**

Run:

```bash
git status --short
```

Expected: state reader files added.

---

### Task 6: Build Scanner With Temp Directory Tests

**Files:**
- Create: `src/lib/workflow/scanner.ts`
- Test: `src/lib/workflow/scanner.test.ts`

- [ ] **Step 1: Write the failing scanner test**

Create `src/lib/workflow/scanner.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanWorkflowDashboard } from "./scanner";

async function writeMarkdown(filePath: string, frontmatter: string, body = "Body"): Promise<void> {
  await writeFile(filePath, `---\n${frontmatter}---\n\n${body}`, "utf-8");
}

test("scanWorkflowDashboard derives story stages, exceptions, and summaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-scan-"));
  try {
    const outputsRoot = join(dir, "ssnn-outputs");
    const siteRoot = join(dir, "site");

    await mkdir(join(outputsRoot, "research-docs"), { recursive: true });
    await mkdir(join(outputsRoot, "research-docs-features"), { recursive: true });
    await mkdir(join(outputsRoot, "articles/published/features"), { recursive: true });
    await mkdir(join(outputsRoot, "articles/social-ready/features"), { recursive: true });
    await mkdir(join(outputsRoot, "review-jobs"), { recursive: true });
    await mkdir(join(siteRoot, "src/content/features"), { recursive: true });
    await mkdir(join(siteRoot, "src/content/sport"), { recursive: true });

    await writeMarkdown(
      join(outputsRoot, "research-docs", "2026-05-16-ai-agents-research.md"),
      "title: AI Agents\ncategory: tech\n"
    );
    await writeMarkdown(
      join(outputsRoot, "research-docs-features", "2026-05-01-nikola-tesla-deep-spotlight-profile-research.md"),
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

    assert.equal(data.stories.some((story) => story.slug.includes("ai-agents-research")), true);
    assert.equal(data.stories.find((story) => story.title === "Nikola Tesla")?.type, "spotlight");
    assert.equal(data.stories.find((story) => story.slug === "biodiversity")?.stage, "ready-image");
    assert.equal(data.stories.find((story) => story.slug === "liverpool")?.stage, "human-review");
    assert.equal(data.stories.find((story) => story.slug === "arson")?.health, "error");
    assert.equal(data.summary.manualMoves, 1);
    assert.equal(data.summary.needsAttention >= 1, true);
    assert.equal(data.exceptions.some((item) => item.title === "Arson"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the failing scanner test**

Run:

```bash
npm run test:lib -- src/lib/workflow/scanner.test.ts
```

Expected: fails because `scanner.ts` does not exist.

- [ ] **Step 3: Implement scanner orchestration**

Create `src/lib/workflow/scanner.ts` with these exported functions and behavior:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { buildWorkflowPaths } from "./paths";
import {
  inferSlugFromFilename,
  parseWorkflowMarkdown,
  titleFromSlug,
} from "./metadata";
import {
  buildAvailableActions,
  inferHealth,
  inferStoryType,
  normalizeVertical,
} from "./stage-inference";
import { readReviewJobs } from "./state-readers";
import {
  WORKFLOW_STAGES,
  type WorkflowDashboardData,
  type WorkflowException,
  type WorkflowHealth,
  type WorkflowStage,
  type WorkflowStageSummary,
  type WorkflowStory,
} from "./types";

export interface ScanWorkflowInput {
  outputsRoot?: string;
  siteRoot?: string;
  now?: Date;
}

interface CandidateStory {
  slug: string;
  title: string;
  sourcePath?: string;
  articlePath?: string;
  reviewPath?: string;
  logPath?: string;
  latestError?: string;
  stage: WorkflowStage;
  type: WorkflowStory["type"];
  vertical: WorkflowStory["vertical"];
  updatedAt: string | null;
  canRetry: boolean;
  canMoveToSocialReady: boolean;
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

async function listMarkdownFilesDeep(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        if (entry.name.startsWith(".")) return [];
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) return listMarkdownFilesDeep(entryPath);
        return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
      })
    );
    return files.flat();
  } catch {
    return [];
  }
}

async function readCandidateFromMarkdown(
  filePath: string,
  fallbackStage: WorkflowStage,
  sourceKind: "research" | "feature-research" | "article" | "site"
): Promise<CandidateStory> {
  const raw = await fs.readFile(filePath, "utf-8");
  const meta = parseWorkflowMarkdown(raw);
  const filename = path.basename(filePath);
  const slug = meta.slug ?? inferSlugFromFilename(filename);
  const type =
    sourceKind === "feature-research"
      ? inferStoryType({
          sourceRootKind: "feature-research",
          filename,
          featureType: meta.featureType,
        })
      : sourceKind === "research"
        ? "normal"
        : meta.featureType === "spotlight" || filename.toLowerCase().includes("spotlight")
          ? "spotlight"
          : "normal";

  const stats = await fs.stat(filePath);
  return {
    slug,
    title: meta.title ?? meta.subjectName ?? titleFromSlug(slug),
    sourcePath: sourceKind === "research" || sourceKind === "feature-research" ? filePath : undefined,
    articlePath: sourceKind === "article" ? filePath : undefined,
    reviewPath: sourceKind === "site" ? `/review/${normalizeVertical(meta.category)}/${slug}` : undefined,
    stage: fallbackStage,
    type,
    vertical: normalizeVertical(meta.category),
    updatedAt: stats.mtime.toISOString(),
    canRetry: false,
    canMoveToSocialReady: fallbackStage === "ready-image",
  };
}

function ageLabel(updatedAt: string | null, now: Date): string {
  if (!updatedAt) return "unknown";
  const diffMs = Math.max(0, now.getTime() - new Date(updatedAt).getTime());
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 1) return `${Math.floor(diffMs / 60_000)}m old`;
  if (diffHours < 48) return `${diffHours}h old`;
  return `${Math.floor(diffHours / 24)}d old`;
}

function isStale(stage: WorkflowStage, updatedAt: string | null, now: Date): boolean {
  if (!updatedAt || stage === "published") return false;
  const ageHours = (now.getTime() - new Date(updatedAt).getTime()) / 3_600_000;
  if (stage === "human-review" || stage === "ready-image") return ageHours >= 24;
  if (stage === "revision" || stage === "image-agent") return ageHours >= 2;
  return ageHours >= 48;
}

function toWorkflowStory(candidate: CandidateStory, now: Date): WorkflowStory {
  const health = inferHealth({
    latestError: candidate.latestError,
    isStale: isStale(candidate.stage, candidate.updatedAt, now),
    hasWarning: candidate.canMoveToSocialReady,
  });
  return {
    id: `${candidate.stage}:${candidate.slug}`,
    slug: candidate.slug,
    title: candidate.title,
    type: candidate.type,
    vertical: candidate.vertical,
    stage: candidate.stage,
    health,
    ageLabel: ageLabel(candidate.updatedAt, now),
    updatedAt: candidate.updatedAt,
    sourcePath: candidate.sourcePath,
    articlePath: candidate.articlePath,
    reviewPath: candidate.reviewPath,
    logPath: candidate.logPath,
    latestError: candidate.latestError,
    availableActions: buildAvailableActions({
      sourcePath: candidate.sourcePath ?? candidate.articlePath ?? null,
      reviewPath: candidate.reviewPath ?? null,
      logPath: candidate.logPath ?? null,
      canRetry: candidate.canRetry,
      canMoveToSocialReady: candidate.canMoveToSocialReady,
    }),
  };
}

function summarizeStages(stories: WorkflowStory[]): WorkflowStageSummary[] {
  return WORKFLOW_STAGES.map((stage) => {
    const matching = stories.filter((story) => story.stage === stage);
    const health: WorkflowHealth = matching.some((story) => story.health === "error")
      ? "error"
      : matching.some((story) => story.health === "stale")
        ? "stale"
        : matching.some((story) => story.health === "warning")
          ? "warning"
          : "ok";
    return {
      stage,
      count: matching.length,
      health,
      detail: matching.length === 0 ? "clear" : `${matching.length} ${matching.length === 1 ? "story" : "stories"}`,
    };
  });
}

function buildExceptions(stories: WorkflowStory[]): WorkflowException[] {
  return stories
    .filter((story) => story.health !== "ok")
    .map((story) => ({
      id: `exception:${story.id}`,
      storyId: story.id,
      stage: story.stage,
      health: story.health === "ok" ? "warning" : story.health,
      title: story.title,
      detail: story.latestError ?? `${story.stage} requires attention`,
      ageLabel: story.ageLabel,
      action: story.availableActions.at(-1),
    }));
}

export async function scanWorkflowDashboard(
  input: ScanWorkflowInput = {}
): Promise<WorkflowDashboardData> {
  const now = input.now ?? new Date();
  const paths = buildWorkflowPaths(input);
  const warnings: string[] = [];

  const researchFiles = await listMarkdownFiles(paths.researchDocsRoot);
  const featureResearchFiles = await listMarkdownFiles(paths.featureResearchDocsRoot);
  const readyImageFiles = await listMarkdownFilesDeep(paths.publishedRoot);
  const socialReadyFiles = await listMarkdownFilesDeep(paths.socialReadyRoot);
  const siteFiles = await listMarkdownFilesDeep(paths.siteContentRoot);
  const reviewJobs = await readReviewJobs(paths.reviewJobsRoot);
  warnings.push(...reviewJobs.warnings);

  const candidates: CandidateStory[] = [];
  for (const file of researchFiles) {
    candidates.push(await readCandidateFromMarkdown(file, "research", "research"));
  }
  for (const file of featureResearchFiles) {
    candidates.push(await readCandidateFromMarkdown(file, "research", "feature-research"));
  }
  for (const file of readyImageFiles) {
    candidates.push(await readCandidateFromMarkdown(file, "ready-image", "article"));
  }
  for (const file of socialReadyFiles) {
    candidates.push(await readCandidateFromMarkdown(file, "image-agent", "article"));
  }
  for (const file of siteFiles) {
    const candidate = await readCandidateFromMarkdown(file, "published", "site");
    const raw = await fs.readFile(file, "utf-8");
    const meta = parseWorkflowMarkdown(raw);
    candidate.stage = meta.status === "pending" ? "human-review" : meta.status === "revision-requested" ? "revision" : "published";
    candidates.push(candidate);
  }

  for (const job of reviewJobs.jobs) {
    if (job.status !== "error" && job.status !== "queued" && job.status !== "running") continue;
    const match = candidates.find((candidate) => candidate.slug === job.slug);
    if (!match) continue;
    match.stage = "revision";
    match.latestError = job.error ?? undefined;
    match.logPath = job.log_path;
    match.canRetry = job.status === "error";
    match.updatedAt = job.updated_at;
  }

  const stories = candidates.map((candidate) => toWorkflowStory(candidate, now));
  const exceptions = buildExceptions(stories);
  return {
    generatedAt: now.toISOString(),
    summary: {
      needsAttention: stories.filter((story) => story.health === "error" || story.health === "stale").length,
      manualMoves: stories.filter((story) => story.availableActions.includes("move-to-social-ready")).length,
      inFlight: stories.filter((story) => story.stage !== "published").length,
      liveToday: stories.filter(
        (story) => story.stage === "published" && story.updatedAt?.startsWith(now.toISOString().slice(0, 10))
      ).length,
    },
    stages: summarizeStages(stories),
    stories,
    exceptions,
    warnings,
  };
}
```

- [ ] **Step 4: Run scanner tests and fix small type issues**

Run:

```bash
npm run test:lib -- src/lib/workflow/scanner.test.ts
```

Expected: passes.

- [ ] **Step 5: Run all workflow tests**

Run:

```bash
npm run test:lib -- src/lib/workflow/*.test.ts
```

Expected: all workflow tests pass.

- [ ] **Step 6: Verification checkpoint**

Run:

```bash
git status --short
```

Expected: workflow scanner files added.

---

### Task 7: Implement Move to Social-Ready Action

**Files:**
- Create: `src/lib/workflow/actions.ts`
- Test: `src/lib/workflow/actions.test.ts`

- [ ] **Step 1: Write the failing action test**

Create `src/lib/workflow/actions.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { moveToSocialReady } from "./actions";

test("moveToSocialReady moves an eligible article into the matching social-ready folder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workflow-action-"));
  try {
    const outputsRoot = join(dir, "ssnn-outputs");
    const publishedDir = join(outputsRoot, "articles/published/sports");
    const sourcePath = join(publishedDir, "2026-05-16-liverpool.md");
    await mkdir(publishedDir, { recursive: true });
    await writeFile(sourcePath, "---\ntitle: Liverpool\ncategory: sports\n---\n\nBody", "utf-8");

    const result = await moveToSocialReady({
      outputsRoot,
      articlePath: sourcePath,
      vertical: "sport",
    });

    assert.equal(result.ok, true);
    assert.equal(
      result.destinationPath,
      join(outputsRoot, "articles/social-ready/sports", "2026-05-16-liverpool.md")
    );
    assert.equal(await readFile(result.destinationPath, "utf-8"), "---\ntitle: Liverpool\ncategory: sports\n---\n\nBody");
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
      () => moveToSocialReady({ outputsRoot, articlePath: sourcePath, vertical: "sport" }),
      /not inside articles\/published/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the failing action test**

Run:

```bash
npm run test:lib -- src/lib/workflow/actions.test.ts
```

Expected: fails because `actions.ts` does not exist.

- [ ] **Step 3: Implement safe move action**

Create `src/lib/workflow/actions.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { buildWorkflowPaths } from "./paths";
import type { WorkflowVertical } from "./types";

export interface MoveToSocialReadyInput {
  outputsRoot?: string;
  articlePath: string;
  vertical: WorkflowVertical;
}

export interface MoveToSocialReadyResult {
  ok: true;
  destinationPath: string;
}

function socialReadyFolderName(vertical: WorkflowVertical): string {
  if (vertical === "sport") return "sports";
  if (vertical === "news") return "news";
  if (vertical === "tech") return "tech";
  if (vertical === "features" || vertical === "spotlights") return "features";
  throw new Error(`Cannot move unknown vertical to social-ready: ${vertical}`);
}

export async function moveToSocialReady(
  input: MoveToSocialReadyInput
): Promise<MoveToSocialReadyResult> {
  const paths = buildWorkflowPaths({ outputsRoot: input.outputsRoot });
  const sourcePath = path.resolve(input.articlePath);
  const publishedRoot = path.resolve(paths.publishedRoot);
  if (!sourcePath.startsWith(`${publishedRoot}${path.sep}`)) {
    throw new Error(`Article is not inside articles/published: ${input.articlePath}`);
  }
  if (!sourcePath.endsWith(".md")) {
    throw new Error(`Article must be a markdown file: ${input.articlePath}`);
  }

  const destinationDir = path.join(paths.socialReadyRoot, socialReadyFolderName(input.vertical));
  const destinationPath = path.join(destinationDir, path.basename(sourcePath));
  await fs.mkdir(destinationDir, { recursive: true });

  try {
    await fs.access(destinationPath);
    throw new Error(`Destination already exists: ${destinationPath}`);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : null;
    if (code !== "ENOENT") throw error;
  }

  await fs.rename(sourcePath, destinationPath);
  return { ok: true, destinationPath };
}
```

- [ ] **Step 4: Run action tests**

Run:

```bash
npm run test:lib -- src/lib/workflow/actions.test.ts
```

Expected: passes.

- [ ] **Step 5: Run workflow tests**

Run:

```bash
npm run test:lib -- src/lib/workflow/*.test.ts
```

Expected: all workflow tests pass.

- [ ] **Step 6: Verification checkpoint**

Run:

```bash
git status --short
```

Expected: action files added.

---

### Task 8: Add Admin Workflow Server Actions

**Files:**
- Create: `src/app/admin/workflow/actions.ts`
- Test: covered by lib tests and manual UI checks

- [ ] **Step 1: Create local-only server action wrappers**

Create `src/app/admin/workflow/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { retryPersistedReviewRequest } from "@/lib/revision/jobs";
import { moveToSocialReady } from "@/lib/workflow/actions";
import type { WorkflowVertical } from "@/lib/workflow/types";

function assertLocalOnly(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Workflow actions are not available in production.");
  }
}

export async function moveWorkflowStoryToSocialReady(formData: FormData): Promise<void> {
  assertLocalOnly();
  const articlePath = formData.get("articlePath");
  const vertical = formData.get("vertical");
  if (typeof articlePath !== "string" || articlePath.length === 0) {
    throw new Error("Missing article path.");
  }
  if (typeof vertical !== "string" || vertical.length === 0) {
    throw new Error("Missing vertical.");
  }
  await moveToSocialReady({
    articlePath,
    vertical: vertical as WorkflowVertical,
  });
  revalidatePath("/admin/workflow");
}

export async function retryWorkflowRevision(formData: FormData): Promise<void> {
  assertLocalOnly();
  const slug = formData.get("slug");
  const vertical = formData.get("vertical");
  if (typeof slug !== "string" || !/^[a-z0-9-]+$/i.test(slug)) {
    throw new Error("Invalid slug.");
  }
  if (
    vertical !== "news" &&
    vertical !== "sport" &&
    vertical !== "tech" &&
    vertical !== "features"
  ) {
    throw new Error("Invalid revision vertical.");
  }
  await retryPersistedReviewRequest({ slug, vertical });
  revalidatePath("/admin/workflow");
}
```

- [ ] **Step 2: Run type-aware build**

Run:

```bash
npm run build
```

Expected: build may fail later because no UI uses these actions yet only if TypeScript import issues exist. Fix import/type issues before continuing.

- [ ] **Step 3: Verification checkpoint**

Run:

```bash
git status --short
```

Expected: server action file added.

---

### Task 9: Build Admin Layout

**Files:**
- Create: `src/app/admin/layout.tsx`

- [ ] **Step 1: Create the admin shell**

Create `src/app/admin/layout.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Admin — Sandbox Daily",
  description: "Internal Sandbox Daily operational dashboards.",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#07090f] text-slate-50">
      <header className="border-b border-slate-800 bg-slate-950/95 px-6 py-4">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <Link href="/admin/workflow" className="font-mono text-xs uppercase tracking-[0.18em] text-slate-200">
            Sandbox Daily Ops
          </Link>
          <nav className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-400">
            <Link className="rounded-full bg-slate-100 px-3 py-2 text-slate-950" href="/admin/workflow">
              Workflow
            </Link>
            <span className="rounded-full border border-slate-700 px-3 py-2">Engagement Later</span>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Run build or lint check**

Run:

```bash
npm run build
```

Expected: passes unless later missing page route is required by Next. If it fails due to missing `/admin/workflow`, continue to Task 10 and rerun.

- [ ] **Step 3: Verification checkpoint**

Run:

```bash
git status --short
```

Expected: admin layout added.

---

### Task 10: Build Workflow Dashboard UI

**Files:**
- Create: `src/app/admin/workflow/page.tsx`
- Create: `src/app/admin/workflow/WorkflowDashboard.tsx`

- [ ] **Step 1: Create the server page**

Create `src/app/admin/workflow/page.tsx`:

```tsx
import { scanWorkflowDashboard } from "@/lib/workflow/scanner";
import { WorkflowDashboard } from "./WorkflowDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Workflow — Sandbox Daily Admin",
  description: "Internal content pipeline control room.",
};

export default async function WorkflowPage() {
  const data = await scanWorkflowDashboard();
  return <WorkflowDashboard data={data} />;
}
```

- [ ] **Step 2: Create the client dashboard component**

Create `src/app/admin/workflow/WorkflowDashboard.tsx`:

```tsx
"use client";

import { AlertTriangle, ArrowRight, ExternalLink, FileText, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import {
  moveWorkflowStoryToSocialReady,
  retryWorkflowRevision,
} from "./actions";
import type {
  WorkflowAction,
  WorkflowDashboardData,
  WorkflowStage,
  WorkflowStory,
  WorkflowStoryType,
} from "@/lib/workflow/types";

interface WorkflowDashboardProps {
  data: WorkflowDashboardData;
}

type Filter = "active" | "errors" | "manual" | WorkflowStoryType | "published";

const stageLabels: Record<WorkflowStage, string> = {
  research: "Research",
  writer: "Writer",
  editor: "Editor",
  "ready-image": "Ready Image",
  "image-agent": "Image Agent",
  "human-review": "Review",
  revision: "Revision",
  published: "Published",
};

function healthClass(health: WorkflowStory["health"]): string {
  if (health === "error") return "border-rose-400/80 bg-rose-500/15 text-rose-50";
  if (health === "stale") return "border-amber-300/80 bg-amber-400/15 text-amber-50";
  if (health === "warning") return "border-yellow-300/80 bg-yellow-300/15 text-yellow-50";
  return "border-slate-700 bg-slate-900 text-slate-100";
}

function storyMatchesFilter(story: WorkflowStory, filter: Filter): boolean {
  if (filter === "active") return story.stage !== "published";
  if (filter === "errors") return story.health === "error" || story.health === "stale";
  if (filter === "manual") return story.availableActions.includes("move-to-social-ready");
  if (filter === "published") return story.stage === "published";
  return story.type === filter;
}

function ActionButton({ action, story }: { action: WorkflowAction; story: WorkflowStory }) {
  if (action === "open-review" && story.reviewPath) {
    return (
      <a href={story.reviewPath} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-slate-100 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-950">
        <ExternalLink size={14} />
        Review
      </a>
    );
  }
  if (action === "retry-failed-job") {
    return (
      <form action={retryWorkflowRevision}>
        <input type="hidden" name="slug" value={story.slug} />
        <input type="hidden" name="vertical" value={story.vertical} />
        <button className="inline-flex min-h-9 items-center gap-2 rounded-full bg-rose-100 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-950">
          <RotateCcw size={14} />
          Retry
        </button>
      </form>
    );
  }
  if (action === "move-to-social-ready" && story.articlePath) {
    return (
      <form action={moveWorkflowStoryToSocialReady}>
        <input type="hidden" name="articlePath" value={story.articlePath} />
        <input type="hidden" name="vertical" value={story.vertical} />
        <button className="inline-flex min-h-9 items-center gap-2 rounded-full bg-amber-100 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-950">
          <ArrowRight size={14} />
          Social Ready
        </button>
      </form>
    );
  }
  return null;
}

export function WorkflowDashboard({ data }: WorkflowDashboardProps) {
  const [filter, setFilter] = useState<Filter>("active");
  const visibleStories = useMemo(
    () => data.stories.filter((story) => storyMatchesFilter(story, filter)),
    [data.stories, filter]
  );

  return (
    <main className="mx-auto max-w-[1600px] px-6 py-6">
      <section className="overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950 shadow-2xl shadow-black/30">
        <div className="grid grid-cols-1 border-b border-slate-800 md:grid-cols-[1.1fr_repeat(4,1fr)]">
          <div className="bg-slate-900 p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">Sandbox Daily Ops</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-50">Content Control Room</h1>
          </div>
          {[
            ["Needs Attention", data.summary.needsAttention, "text-rose-300"],
            ["Manual Moves", data.summary.manualMoves, "text-amber-300"],
            ["In Flight", data.summary.inFlight, "text-slate-50"],
            ["Live Today", data.summary.liveToday, "text-emerald-300"],
          ].map(([label, value, className]) => (
            <div key={label} className="border-t border-slate-800 p-6 md:border-l md:border-t-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</p>
              <p className={`mt-2 text-4xl font-black ${className}`}>{value}</p>
            </div>
          ))}
        </div>

        {data.warnings.length > 0 && (
          <div className="border-b border-amber-300/30 bg-amber-300/10 px-6 py-3 text-sm text-amber-100">
            {data.warnings.slice(0, 2).map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}

        <div className="grid gap-5 p-5 xl:grid-cols-[1fr_360px]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <h2 className="text-base font-bold text-slate-100">Live Pipeline Map</h2>
              <div className="flex flex-wrap gap-2">
                {(["active", "normal", "feature", "spotlight", "errors"] as Filter[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => setFilter(item)}
                    className={`min-h-9 rounded-full px-3 font-mono text-[10px] uppercase tracking-[0.12em] ${
                      filter === item ? "bg-slate-100 text-slate-950" : "border border-slate-700 text-slate-400"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
              {data.stages.map((stage) => (
                <button
                  key={stage.stage}
                  onClick={() => setFilter("active")}
                  className={`min-h-32 rounded-2xl border p-4 text-left ${healthClass(stage.health)}`}
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-75">{stageLabels[stage.stage]}</span>
                  <strong className="mt-3 block text-4xl">{stage.count}</strong>
                  <span className="mt-2 block font-mono text-[11px] opacity-70">{stage.detail}</span>
                </button>
              ))}
            </div>

            <div className="space-y-3 px-5 pb-5">
              {(["normal", "feature", "spotlight"] as WorkflowStoryType[]).map((type) => (
                <div key={type} className="grid gap-2 xl:grid-cols-[100px_repeat(8,1fr)]">
                  <div className="self-center text-sm font-bold capitalize text-slate-200">{type}</div>
                  {data.stages.map((stage) => {
                    const laneStories = data.stories.filter((story) => story.type === type && story.stage === stage.stage).slice(0, 2);
                    return (
                      <div key={`${type}-${stage.stage}`} className="min-h-12 rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                        {laneStories.map((story) => (
                          <button
                            key={story.id}
                            onClick={() => setFilter(type)}
                            className={`mb-1 block max-w-full truncate rounded-full border px-2 py-1 text-left font-mono text-[10px] ${healthClass(story.health)}`}
                          >
                            {story.title}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-800 bg-slate-900/80">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <h2 className="text-base font-bold text-slate-100">Exceptions Feed</h2>
              <AlertTriangle className="text-amber-300" size={18} />
            </div>
            <div className="space-y-3 p-4">
              {data.exceptions.length === 0 ? (
                <p className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">No exceptions right now.</p>
              ) : (
                data.exceptions.slice(0, 6).map((item) => (
                  <article key={item.id} className={`rounded-2xl border p-4 ${healthClass(item.health)}`}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-75">{item.ageLabel} · {stageLabels[item.stage]}</p>
                    <h3 className="mt-2 text-sm font-bold leading-snug">{item.title}</h3>
                    <p className="mt-2 text-xs opacity-80">{item.detail}</p>
                  </article>
                ))
              )}
            </div>
          </aside>

          <section className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/80">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <h2 className="text-base font-bold text-slate-100">Story Drill-Down</h2>
              <button onClick={() => setFilter("manual")} className="min-h-9 rounded-full border border-slate-700 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300">
                Manual Moves
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left">
                <thead className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Story</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Vertical</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Health</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStories.map((story) => (
                    <tr key={story.id} className="border-t border-slate-800 text-sm text-slate-300">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-50">{story.title}</div>
                        <div className="mt-1 font-mono text-[10px] text-slate-500">{story.slug}</div>
                      </td>
                      <td className="px-4 py-3 capitalize">{story.type}</td>
                      <td className="px-4 py-3">{story.vertical}</td>
                      <td className="px-4 py-3">{stageLabels[story.stage]}</td>
                      <td className="px-4 py-3">{story.health} · {story.ageLabel}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {story.availableActions.map((action) => (
                            <ActionButton key={action} action={action} story={story} />
                          ))}
                          {(story.sourcePath || story.articlePath || story.logPath) && (
                            <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-700 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400">
                              <FileText size={14} />
                              File
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: passes. If Next rejects server action imports into the client component, convert action usage to route handlers in Task 11 before rerunning.

- [ ] **Step 4: Manual browser check**

Run:

```bash
npm run dev
```

Open `http://localhost:3000/admin/workflow` or the port Next chooses. Expected: dashboard renders real counts, exceptions, swimlanes, and table without crashing.

- [ ] **Step 5: Verification checkpoint**

Run:

```bash
git status --short
```

Expected: admin page and dashboard component added.

---

### Task 11: Add Route Handler Fallbacks if Server Actions Are Not Enough

**Files:**
- Create only if Task 10 build or UX requires route handlers:
  - `src/app/api/admin/workflow/move-to-social-ready/route.ts`

- [ ] **Step 1: Create move route if needed**

Create `src/app/api/admin/workflow/move-to-social-ready/route.ts`:

```ts
import { NextResponse } from "next/server";
import { moveToSocialReady } from "@/lib/workflow/actions";
import type { WorkflowVertical } from "@/lib/workflow/types";

interface MoveBody {
  articlePath?: unknown;
  vertical?: unknown;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not available in production" }, { status: 403 });
  }

  let body: MoveBody;
  try {
    body = (await request.json()) as MoveBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.articlePath !== "string" || body.articlePath.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing articlePath" }, { status: 400 });
  }
  if (typeof body.vertical !== "string" || body.vertical.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing vertical" }, { status: 400 });
  }

  try {
    const result = await moveToSocialReady({
      articlePath: body.articlePath,
      vertical: body.vertical as WorkflowVertical,
    });
    return NextResponse.json({ ok: true, destinationPath: result.destinationPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to move article";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Update `WorkflowDashboard.tsx` only if using route handlers**

Replace the form action for `move-to-social-ready` with a client submit handler that posts JSON to `/api/admin/workflow/move-to-social-ready`, then calls `window.location.reload()` on success. Keep the server-action version if it builds and behaves correctly.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: passes.

- [ ] **Step 4: Verification checkpoint**

Run:

```bash
git status --short
```

Expected: route handler exists only if needed.

---

### Task 12: Final Verification

**Files:**
- No new files unless fixing defects found by verification.

- [ ] **Step 1: Run focused workflow tests**

Run:

```bash
npm run test:lib -- src/lib/workflow/*.test.ts
```

Expected: all workflow tests pass.

- [ ] **Step 2: Run existing library tests**

Run:

```bash
npm run test:lib
```

Expected: all existing library tests pass.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: Next.js build passes.

- [ ] **Step 4: Run local app and inspect dashboard**

Run:

```bash
npm run dev
```

Open `/admin/workflow`. Check:

- KPI counts render.
- pipeline stages render left-to-right on desktop.
- swimlanes render for `Normal`, `Feature`, and `Spotlight`.
- exceptions feed renders failed/stale/manual items.
- table filters work.
- `Open review` links go to existing `/review/[vertical]/[slug]` routes.
- `Move to social-ready` appears only for eligible `ready-image` stories.
- `Retry` appears only where an errored revision job exists.

- [ ] **Step 5: Git status review**

Run:

```bash
git status --short
```

Expected: only workflow dashboard files and the previously approved `.gitignore`/spec/plan files are modified. Existing unrelated untracked article/image files may still appear; do not touch them.

---

## Spec Coverage Checklist

- Shows every story from research through publication: Tasks 3, 4, 6, 10.
- Bottlenecks at a glance: Tasks 6 and 10.
- Normal/Feature/Spotlight separation: Tasks 4, 6, 10.
- Failed jobs, stale items, logs, manual handoffs: Tasks 5, 6, 10.
- Safe actions: Tasks 7, 8, 10, 11.
- `/admin/workflow` inside Next.js: Tasks 9 and 10.
- Local/dev-only action boundary: Tasks 8 and 11.
- Engagement and virality deferred: maintained by file scope and no tasks for those surfaces.

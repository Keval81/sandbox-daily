# Review Revisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Request revision" action to `/review` that lets the editor annotate passages inline, optionally request image regeneration, and trigger a new reviser-agent to produce a revised draft within ~30s.

**Architecture:** Site UI (Next.js + React 19) submits annotation payload to `POST /api/review/revision`, which writes a JSON sidecar to the agent codebase, flips the article's status, and spawns a detached `reviser-agent` (TypeScript + tsx, mirrors editor-agent). Reviser writes status updates to a job-record JSON; site UI polls until `done | error`. On `done`, page reloads with the new `pending` draft.

**Tech Stack:**
- Site: Next.js 16.2.3, React 19.2, Tailwind 4, gray-matter, App Router
- Agents: Node (built-in `--test`), tsx, Claude CLI provider (shell out to `/opt/homebrew/bin/claude`)
- IPC: filesystem (JSON sidecars + job record files), no databases, no message bus

**Spec:** `docs/superpowers/specs/2026-05-10-review-revisions-design.md`

---

## Phase 0 — Pre-flight

### Task 0.1: Verify Next 16.2.3 conventions before writing route handlers / client components

The site repo's `AGENTS.md` warns: *"This is NOT the Next.js you know — APIs, conventions, and file structure may all differ from your training data."* This task is non-negotiable before touching any `app/` code.

**Files:**
- Read: `node_modules/next/dist/docs/` (whatever guides exist there)

- [ ] **Step 1: List the docs available**

Run:
```bash
ls "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/node_modules/next/dist/docs/" 2>/dev/null
```

- [ ] **Step 2: Skim the route-handler doc + client-component doc**

Read whichever guides cover:
- POST/GET route handlers in App Router (request/response shape, body parsing, status codes)
- `"use client"` directive placement and constraints
- Streaming / Suspense behavior if relevant

If a guide names a deprecated API used by the existing `src/app/api/review/route.ts`, flag it before proceeding.

- [ ] **Step 3: Confirm `force-dynamic` still applies**

The current review pages use `export const dynamic = "force-dynamic"`. Confirm this is still the documented way to opt out of static rendering.

- [ ] **Step 4: Note any constraints in the plan**

If anything contradicts the plan (e.g., spawning child processes from a route is now restricted, or `request.json()` returns differently), pause and surface to the user before continuing.

---

## Phase 1 — Reviser-agent (`~/Desktop/ssnn-outputs/reviser-agent/`)

### Task 1.1: Scaffold the reviser-agent package

**Files:**
- Create: `~/Desktop/ssnn-outputs/reviser-agent/package.json`
- Create: `~/Desktop/ssnn-outputs/reviser-agent/tsconfig.json`
- Create: `~/Desktop/ssnn-outputs/reviser-agent/.gitignore`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p ~/Desktop/ssnn-outputs/reviser-agent/src
mkdir -p ~/Desktop/ssnn-outputs/reviser-agent/tests/helpers
```

- [ ] **Step 2: Write `package.json`** — clones the editor-agent shape

```json
{
  "name": "ssnn-reviser-agent",
  "version": "0.1.0",
  "description": "SSNN Reviser Agent — produces revised drafts from editor annotations",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "node --import tsx --test tests/*.test.ts",
    "test:watch": "node --import tsx --test --watch tests/*.test.ts"
  },
  "dependencies": {
    "gray-matter": "^4.0.3"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

Note: `gray-matter` is a runtime dep here (parses article frontmatter on the agent side). Editor-agent doesn't use it because it parses with regex; reviser-agent reads files written by gray-matter on the site side, so we use the same library for symmetry.

- [ ] **Step 3: Write `tsconfig.json`** — clone editor-agent's

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "verbatimModuleSyntax": false,
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules
dist
*.log
```

- [ ] **Step 5: Install dependencies**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && npm install
```

Expected: clean install, lockfile created, no errors.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && git init -q 2>/dev/null; \
  git add -A && git commit -m "chore: scaffold reviser-agent package"
```

(Note: the broader `ssnn-outputs/` directory may or may not already be a git repo — `git init` is a no-op if it is.)

---

### Task 1.2: Shared types

**Files:**
- Create: `~/Desktop/ssnn-outputs/reviser-agent/src/types.ts`

- [ ] **Step 1: Write the types file**

```ts
/**
 * Shared shapes between the site repo's POST /api/review/revision endpoint
 * and the reviser-agent. Keep these in sync with src/lib/revision/types.ts
 * in the site repo.
 */

export interface InlineComment {
  id: string;
  quote: string;
  paragraph_index: number;
  paragraph_text: string;
  preceding_context: string;
  following_context: string;
  comment: string;
  created_at: string;
}

export interface ImageRevision {
  regenerate: boolean;
  context: string | null;
}

export interface ReviewRequest {
  slug: string;
  vertical: "news" | "sport" | "tech" | "features";
  round: number;
  submitted_at: string;
  overall_notes: string;
  inline_comments: InlineComment[];
  image: ImageRevision;
}

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobRecord {
  id: string;
  slug: string;
  vertical: ReviewRequest["vertical"];
  status: JobStatus;
  current_step: string | null;
  started_at: string;
  updated_at: string;
  error: string | null;
  log_path: string;
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && \
  git add src/types.ts && git commit -m "feat(reviser): shared types"
```

---

### Task 1.3: Job status writer (TDD)

**Files:**
- Create: `~/Desktop/ssnn-outputs/reviser-agent/tests/job.test.ts`
- Create: `~/Desktop/ssnn-outputs/reviser-agent/src/job.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/job.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeJobUpdate, type WriteJobOptions } from "../src/job.ts";

test("writeJobUpdate creates job record on first call", async () => {
  const dir = await mkdtemp(join(tmpdir(), "job-"));
  try {
    const opts: WriteJobOptions = {
      jobId: "job-1",
      jobsDir: dir,
      slug: "the-itauma-piece",
      vertical: "sport",
      logPath: "/tmp/job-1.log",
    };
    await writeJobUpdate(opts, { status: "running", current_step: "starting" });
    const raw = await readFile(join(dir, "job-1.json"), "utf-8");
    const record = JSON.parse(raw);
    assert.equal(record.id, "job-1");
    assert.equal(record.status, "running");
    assert.equal(record.current_step, "starting");
    assert.equal(record.slug, "the-itauma-piece");
    assert.equal(record.vertical, "sport");
    assert.ok(record.started_at);
    assert.ok(record.updated_at);
    assert.equal(record.error, null);
    assert.equal(record.log_path, "/tmp/job-1.log");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("writeJobUpdate updates existing record without resetting started_at", async () => {
  const dir = await mkdtemp(join(tmpdir(), "job-"));
  try {
    const opts: WriteJobOptions = {
      jobId: "job-2",
      jobsDir: dir,
      slug: "x",
      vertical: "tech",
      logPath: "/tmp/x.log",
    };
    await writeJobUpdate(opts, { status: "running", current_step: "first" });
    const first = JSON.parse(await readFile(join(dir, "job-2.json"), "utf-8"));
    await new Promise((r) => setTimeout(r, 10));
    await writeJobUpdate(opts, { status: "running", current_step: "second" });
    const second = JSON.parse(await readFile(join(dir, "job-2.json"), "utf-8"));
    assert.equal(second.started_at, first.started_at);
    assert.notEqual(second.updated_at, first.updated_at);
    assert.equal(second.current_step, "second");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("writeJobUpdate sets error field on error status", async () => {
  const dir = await mkdtemp(join(tmpdir(), "job-"));
  try {
    const opts: WriteJobOptions = {
      jobId: "job-3",
      jobsDir: dir,
      slug: "x",
      vertical: "news",
      logPath: "/tmp/x.log",
    };
    await writeJobUpdate(opts, {
      status: "error",
      error: "Output failed validation: missing H1",
    });
    const record = JSON.parse(await readFile(join(dir, "job-3.json"), "utf-8"));
    assert.equal(record.status, "error");
    assert.equal(record.error, "Output failed validation: missing H1");
  } finally {
    await rm(dir, { recursive: true });
  }
});
```

- [ ] **Step 2: Run the tests — confirm they fail**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && npm test
```

Expected: failure with `Cannot find module '../src/job.ts'`.

- [ ] **Step 3: Implement `src/job.ts`**

```ts
// src/job.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { JobRecord, JobStatus, ReviewRequest } from "./types.js";

export interface WriteJobOptions {
  jobId: string;
  jobsDir: string;
  slug: string;
  vertical: ReviewRequest["vertical"];
  logPath: string;
}

export interface JobUpdate {
  status: JobStatus;
  current_step?: string;
  error?: string;
}

/**
 * Reads the existing job record (if any) and writes an updated version.
 * `started_at` is preserved across calls; `updated_at` advances every call.
 */
export async function writeJobUpdate(
  opts: WriteJobOptions,
  update: JobUpdate
): Promise<JobRecord> {
  await mkdir(opts.jobsDir, { recursive: true });
  const filePath = join(opts.jobsDir, `${opts.jobId}.json`);
  const now = new Date().toISOString();

  let existing: JobRecord | null = null;
  try {
    const raw = await readFile(filePath, "utf-8");
    existing = JSON.parse(raw) as JobRecord;
  } catch {
    existing = null;
  }

  const next: JobRecord = {
    id: opts.jobId,
    slug: opts.slug,
    vertical: opts.vertical,
    status: update.status,
    current_step: update.current_step ?? existing?.current_step ?? null,
    started_at: existing?.started_at ?? now,
    updated_at: now,
    error: update.error ?? null,
    log_path: opts.logPath,
  };

  await writeFile(filePath, JSON.stringify(next, null, 2), "utf-8");
  return next;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && npm test
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && \
  git add src/job.ts tests/job.test.ts && \
  git commit -m "feat(reviser): job status writer with TDD"
```

---

### Task 1.4: Claude CLI provider (clone from editor-agent)

**Files:**
- Create: `~/Desktop/ssnn-outputs/reviser-agent/src/llm.ts`

- [ ] **Step 1: Read editor-agent's llm.ts in full**

```bash
cat ~/Desktop/ssnn-outputs/editor-agent/src/llm.ts
```

We are cloning, not modifying. The reviser uses the exact same provider semantics (Claude CLI, OAuth-backed, 3-min timeout, 4MB stdout cap).

- [ ] **Step 2: Copy the file verbatim**

```bash
cp ~/Desktop/ssnn-outputs/editor-agent/src/llm.ts \
   ~/Desktop/ssnn-outputs/reviser-agent/src/llm.ts
```

- [ ] **Step 3: Smoke-check the import compiles**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && \
  git add src/llm.ts && \
  git commit -m "feat(reviser): clone Claude CLI provider from editor-agent"
```

---

### Task 1.5: Output validator (TDD — 4 rules)

**Files:**
- Create: `~/Desktop/ssnn-outputs/reviser-agent/tests/validator.test.ts`
- Create: `~/Desktop/ssnn-outputs/reviser-agent/src/validator.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// tests/validator.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRevision } from "../src/validator.ts";

const ORIGINAL = `# Original Title

This is paragraph one. It has roughly twenty words to give the validator a baseline word count to compare against.

This is paragraph two with another set of words to make a meaningful word count.`;

test("accepts a valid revision", () => {
  const revised = `# Original Title

This is the revised paragraph one with similar length to the original baseline word count.

This is the revised paragraph two also with a meaningful word count match.`;
  const result = validateRevision({ original: ORIGINAL, revised });
  assert.equal(result.ok, true);
});

test("rejects empty output", () => {
  const result = validateRevision({ original: ORIGINAL, revised: "   " });
  assert.equal(result.ok, false);
  assert.match(result.reason, /empty/i);
});

test("rejects output missing the H1", () => {
  const result = validateRevision({
    original: ORIGINAL,
    revised: "This has no heading at all, just body text.",
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /h1|title|heading/i);
});

test("rejects output where the H1 has been rewritten", () => {
  const result = validateRevision({
    original: ORIGINAL,
    revised: `# A Different Title\n\nSome body text.`,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /title|heading/i);
});

test("rejects output > 140% of original word count", () => {
  const huge = "# Original Title\n\n" + "word ".repeat(500);
  const result = validateRevision({ original: ORIGINAL, revised: huge });
  assert.equal(result.ok, false);
  assert.match(result.reason, /word count|length/i);
});

test("rejects output < 60% of original word count", () => {
  const tiny = "# Original Title\n\nfew words.";
  const result = validateRevision({ original: ORIGINAL, revised: tiny });
  assert.equal(result.ok, false);
  assert.match(result.reason, /word count|length/i);
});

test("rejects output with unclosed code fence", () => {
  const broken = `# Original Title\n\n\`\`\`\nstart of code with no closing fence ever.`;
  const result = validateRevision({ original: ORIGINAL, revised: broken });
  assert.equal(result.ok, false);
  assert.match(result.reason, /markdown|fence|invalid/i);
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && npm test
```

Expected: failures from missing module `../src/validator.ts`.

- [ ] **Step 3: Implement `src/validator.ts`**

```ts
// src/validator.ts

export interface ValidateInput {
  original: string;
  revised: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

const WORD_COUNT_FLOOR = 0.6;
const WORD_COUNT_CEILING = 1.4;

export function validateRevision(input: ValidateInput): ValidationResult {
  const trimmed = input.revised.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "Revised output is empty." };
  }

  const originalH1 = extractH1(input.original);
  const revisedH1 = extractH1(trimmed);

  if (originalH1 === null) {
    // Original had no H1 — skip the title check; this is an article without
    // an enforced heading, which we don't expect but won't fail on.
  } else {
    if (revisedH1 === null) {
      return {
        ok: false,
        reason: "Revised output has no H1 heading. Original had: " + originalH1,
      };
    }
    if (revisedH1 !== originalH1) {
      return {
        ok: false,
        reason: `Revised H1 differs from original. Expected "${originalH1}", got "${revisedH1}".`,
      };
    }
  }

  const originalWords = countWords(input.original);
  const revisedWords = countWords(trimmed);
  const ratio = revisedWords / Math.max(originalWords, 1);
  if (ratio < WORD_COUNT_FLOOR || ratio > WORD_COUNT_CEILING) {
    return {
      ok: false,
      reason: `Revised word count ${revisedWords} is outside the ±40% band of original ${originalWords} (ratio ${ratio.toFixed(2)}).`,
    };
  }

  if (hasUnbalancedFences(trimmed)) {
    return {
      ok: false,
      reason: "Revised output has an unclosed markdown code fence (invalid markdown).",
    };
  }

  return { ok: true };
}

function extractH1(markdown: string): string | null {
  const lines = markdown.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      return trimmed.slice(2).trim();
    }
  }
  return null;
}

function countWords(markdown: string): number {
  return markdown
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .length;
}

function hasUnbalancedFences(markdown: string): boolean {
  const matches = markdown.match(/^```/gm);
  if (!matches) return false;
  return matches.length % 2 !== 0;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && npm test
```

Expected: all validator tests pass; job tests still pass.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && \
  git add src/validator.ts tests/validator.test.ts && \
  git commit -m "feat(reviser): output validator with TDD (4 rules)"
```

---

### Task 1.6: Prompt builder

**Files:**
- Create: `~/Desktop/ssnn-outputs/reviser-agent/tests/prompt.test.ts`
- Create: `~/Desktop/ssnn-outputs/reviser-agent/src/prompt.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/prompt.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, REVISER_SYSTEM_PROMPT } from "../src/prompt.ts";
import type { ReviewRequest } from "../src/types.ts";

const ARTICLE = `# Itauma's Quiet Threat

The surest measure of a fighter's menace has never been his knockout reel.

It's the expanding universe of perfectly logical excuses his rivals construct.`;

const REQUEST: ReviewRequest = {
  slug: "itauma-piece",
  vertical: "sport",
  round: 1,
  submitted_at: "2026-05-10T15:42:11.000Z",
  overall_notes: "Tighten the second half.",
  inline_comments: [
    {
      id: "c1",
      quote: "his knockout reel",
      paragraph_index: 1,
      paragraph_text: "The surest measure of a fighter's menace has never been his knockout reel.",
      preceding_context: "",
      following_context: "It's the expanding universe of perfectly logical excuses his rivals construct.",
      comment: "Make this image more vivid.",
      created_at: "2026-05-10T15:38:02.000Z",
    },
  ],
  image: { regenerate: false, context: null },
};

test("buildPrompt embeds the article body verbatim", () => {
  const { user } = buildPrompt({ articleBody: ARTICLE, request: REQUEST });
  assert.ok(user.includes("knockout reel"));
});

test("buildPrompt includes overall notes when present", () => {
  const { user } = buildPrompt({ articleBody: ARTICLE, request: REQUEST });
  assert.ok(user.includes("Tighten the second half."));
});

test("buildPrompt numbers and embeds each inline comment with its quote and context", () => {
  const { user } = buildPrompt({ articleBody: ARTICLE, request: REQUEST });
  assert.ok(user.includes("Comment 1"));
  assert.ok(user.includes("his knockout reel"));
  assert.ok(user.includes("Make this image more vivid."));
});

test("buildPrompt omits the overall-notes block when notes are empty", () => {
  const noNotes: ReviewRequest = { ...REQUEST, overall_notes: "" };
  const { user } = buildPrompt({ articleBody: ARTICLE, request: noNotes });
  assert.ok(!user.match(/overall notes/i));
});

test("system prompt forbids editing frontmatter", () => {
  assert.match(REVISER_SYSTEM_PROMPT, /frontmatter/i);
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && npm test
```

Expected: failures from missing module `../src/prompt.ts`.

- [ ] **Step 3: Implement `src/prompt.ts`**

```ts
// src/prompt.ts
import type { ReviewRequest } from "./types.js";

export const REVISER_SYSTEM_PROMPT = `You are the reviser for Sandbox Daily. You revise a published article in response to specific editorial critique.

YOUR JOB:
- Address each inline comment specifically. Do not make general improvements.
- Treat the editor's notes as binding intent: if a comment asks for emphasis on a passage, give it emphasis. If a comment asks for tighter prose, tighten that exact passage — not the whole article.
- Preserve voice, tone, structure, sourced facts, and overall length unless the editor's notes explicitly require change.
- Distinguish concrete asks (rewrite this paragraph; change this framing) from vague pressure (this could be punchier — small adjustment, not wholesale rewrite).

HARD CONSTRAINTS:
- DO NOT include any frontmatter (no YAML between --- markers). Output the article body only, starting with the # H1 heading.
- DO NOT change the H1 heading text. Keep the title exactly as-is.
- DO NOT change the structure of the piece (section headings, paragraph order) unless an editorial note explicitly asks for it.
- Output the FULL revised article body — every paragraph, in order — not just the changed parts.
- Output markdown only. No commentary, no preamble, no explanation of what you changed.`;

export interface BuildPromptInput {
  articleBody: string;
  request: ReviewRequest;
}

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const { articleBody, request } = input;
  const sections: string[] = [];

  sections.push(`ARTICLE (current draft, body only — frontmatter has been stripped):\n\n${articleBody}`);

  if (request.overall_notes.trim().length > 0) {
    sections.push(`EDITOR'S OVERALL NOTES:\n\n${request.overall_notes.trim()}`);
  }

  if (request.inline_comments.length > 0) {
    const numbered = request.inline_comments.map((c, idx) => {
      const lines: string[] = [];
      lines.push(`Comment ${idx + 1} (paragraph ${c.paragraph_index}):`);
      lines.push(`  RE this passage: "${c.quote}"`);
      lines.push(`  Local paragraph: "${c.paragraph_text}"`);
      if (c.preceding_context) {
        lines.push(`  What came before: "${truncate(c.preceding_context, 280)}"`);
      }
      if (c.following_context) {
        lines.push(`  What comes after: "${truncate(c.following_context, 280)}"`);
      }
      lines.push(`  Editor's note: ${c.comment}`);
      return lines.join("\n");
    });
    sections.push(`INLINE COMMENTS (in document order):\n\n${numbered.join("\n\n")}`);
  }

  sections.push(`Produce the revised article in full. Output the article body only, starting with the # H1 heading. No frontmatter, no commentary.`);

  return {
    system: REVISER_SYSTEM_PROMPT,
    user: sections.join("\n\n---\n\n"),
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && npm test
```

Expected: all prompt tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && \
  git add src/prompt.ts tests/prompt.test.ts && \
  git commit -m "feat(reviser): prompt builder with TDD"
```

---

### Task 1.7: Publisher (writes revised .md, archives original)

**Files:**
- Create: `~/Desktop/ssnn-outputs/reviser-agent/tests/publisher.test.ts`
- Create: `~/Desktop/ssnn-outputs/reviser-agent/src/publisher.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/publisher.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { publishRevision } from "../src/publisher.ts";

async function fixture(): Promise<{
  root: string;
  articlePath: string;
  archiveRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "publish-"));
  const sportDir = join(root, "site/src/content/sport");
  await mkdir(sportDir, { recursive: true });
  const articlePath = join(sportDir, "2026-05-10-itauma.md");
  const original = matter.stringify(
    "# Itauma's Quiet Threat\n\nFirst paragraph body.\n",
    {
      title: "Itauma's Quiet Threat",
      slug: "itauma",
      date: "2026-05-10",
      category: "sports",
      hero_image: "/images/articles/itauma.png",
      status: "revision-requested",
    }
  );
  await writeFile(articlePath, original, "utf-8");
  const archiveRoot = join(root, "archive");
  return {
    root,
    articlePath,
    archiveRoot,
    cleanup: () => rm(root, { recursive: true }),
  };
}

test("publishRevision writes revised body, preserves frontmatter, increments revision_round", async () => {
  const f = await fixture();
  try {
    const revisedBody = "# Itauma's Quiet Threat\n\nA tighter, sharper first paragraph.\n";
    await publishRevision({
      articlePath: f.articlePath,
      revisedBody,
      archiveRoot: f.archiveRoot,
      slug: "itauma",
    });
    const after = matter(await readFile(f.articlePath, "utf-8"));
    assert.equal(after.data.status, "pending");
    assert.equal(after.data.revision_round, 1);
    assert.equal(after.data.title, "Itauma's Quiet Threat");
    assert.equal(after.data.hero_image, "/images/articles/itauma.png");
    assert.ok(after.data.last_revised_at);
    assert.match(after.content, /tighter, sharper/);
  } finally {
    await f.cleanup();
  }
});

test("publishRevision archives the original .md before overwrite", async () => {
  const f = await fixture();
  try {
    await publishRevision({
      articlePath: f.articlePath,
      revisedBody: "# Itauma's Quiet Threat\n\nNew body.\n",
      archiveRoot: f.archiveRoot,
      slug: "itauma",
    });
    const { readdir } = await import("node:fs/promises");
    const slugDir = join(f.archiveRoot, "itauma");
    const stamps = await readdir(slugDir);
    assert.equal(stamps.length, 1);
    const archivedFiles = await readdir(join(slugDir, stamps[0]!));
    assert.ok(archivedFiles.includes("original.md"));
  } finally {
    await f.cleanup();
  }
});

test("publishRevision increments revision_round on round 2+", async () => {
  const f = await fixture();
  try {
    await publishRevision({
      articlePath: f.articlePath,
      revisedBody: "# Itauma's Quiet Threat\n\nRound 1 body.\n",
      archiveRoot: f.archiveRoot,
      slug: "itauma",
    });
    await publishRevision({
      articlePath: f.articlePath,
      revisedBody: "# Itauma's Quiet Threat\n\nRound 2 body.\n",
      archiveRoot: f.archiveRoot,
      slug: "itauma",
    });
    const after = matter(await readFile(f.articlePath, "utf-8"));
    assert.equal(after.data.revision_round, 2);
  } finally {
    await f.cleanup();
  }
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && npm test
```

Expected: failures from missing module `../src/publisher.ts`.

- [ ] **Step 3: Implement `src/publisher.ts`**

```ts
// src/publisher.ts
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

export interface PublishInput {
  articlePath: string;
  revisedBody: string;
  archiveRoot: string;
  slug: string;
}

export async function publishRevision(input: PublishInput): Promise<void> {
  const { articlePath, revisedBody, archiveRoot, slug } = input;

  const original = await readFile(articlePath, "utf-8");
  const parsed = matter(original);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveDir = join(archiveRoot, slug, stamp);
  await mkdir(archiveDir, { recursive: true });
  await copyFile(articlePath, join(archiveDir, "original.md"));

  const prevRound = typeof parsed.data.revision_round === "number"
    ? parsed.data.revision_round
    : 0;

  const nextFrontmatter = {
    ...parsed.data,
    status: "pending",
    revision_round: prevRound + 1,
    last_revised_at: new Date().toISOString(),
  };

  const stripped = stripFrontmatterFromBody(revisedBody);
  const next = matter.stringify(stripped, nextFrontmatter);
  await writeFile(articlePath, next, "utf-8");
}

function stripFrontmatterFromBody(body: string): string {
  const trimmed = body.trimStart();
  if (!trimmed.startsWith("---")) return body.trimStart();
  const closing = trimmed.indexOf("\n---", 3);
  if (closing === -1) return body.trimStart();
  return trimmed.slice(closing + 4).trimStart();
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && npm test
```

Expected: all publisher tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && \
  git add src/publisher.ts tests/publisher.test.ts && \
  git commit -m "feat(reviser): publisher writes revised .md, archives original"
```

---

### Task 1.8: CLI orchestration (`src/index.ts`)

**Files:**
- Create: `~/Desktop/ssnn-outputs/reviser-agent/src/index.ts`

This task is integration code — no new TDD beyond the unit tests already written. We'll do an end-to-end smoke test in Task 1.9.

- [ ] **Step 1: Write `src/index.ts`**

```ts
// src/index.ts
import { readFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import matter from "gray-matter";
import { ClaudeCLIProvider } from "./llm.js";
import { buildPrompt } from "./prompt.js";
import { validateRevision } from "./validator.js";
import { publishRevision } from "./publisher.js";
import { writeJobUpdate, type WriteJobOptions } from "./job.js";
import type { ReviewRequest } from "./types.js";

const SITE_CONTENT_ROOT = process.env.SANDBOX_DAILY_SITE_CONTENT
  ?? "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/src/content";
const REVIEW_REQUESTS_ROOT = process.env.SSNN_REVIEW_REQUESTS
  ?? "/Users/sandboxsansan/Desktop/ssnn-outputs/review-requests";
const REVIEW_ARCHIVE_ROOT = process.env.SSNN_REVIEW_ARCHIVE
  ?? "/Users/sandboxsansan/Desktop/ssnn-outputs/review-archive";
const REVIEW_JOBS_ROOT = process.env.SSNN_REVIEW_JOBS
  ?? "/Users/sandboxsansan/Desktop/ssnn-outputs/review-jobs";
const IMAGE_AGENT_PATH = process.env.SSNN_IMAGE_AGENT_PATH
  ?? "/Users/sandboxsansan/Desktop/ssnn-outputs/image-agent";

interface CliOptions {
  slug: string;
  vertical: ReviewRequest["vertical"];
  jobId?: string;
}

function parseCliArgs(argv: string[]): CliOptions {
  const opts: Partial<CliOptions> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--slug" && argv[i + 1]) opts.slug = argv[++i]!;
    else if (arg === "--vertical" && argv[i + 1]) {
      const v = argv[++i]!;
      if (v !== "news" && v !== "sport" && v !== "tech" && v !== "features") {
        throw new Error(`Invalid vertical: ${v}`);
      }
      opts.vertical = v;
    }
    else if (arg === "--job-id" && argv[i + 1]) opts.jobId = argv[++i]!;
  }
  if (!opts.slug || !opts.vertical) {
    throw new Error("Usage: reviser-agent --slug <slug> --vertical <news|sport|tech|features> [--job-id <id>]");
  }
  return opts as CliOptions;
}

async function findArticleFile(vertical: string, slug: string): Promise<string> {
  const dir = join(SITE_CONTENT_ROOT, vertical);
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir);
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const p = join(dir, entry);
    const raw = await readFile(p, "utf-8");
    const { data } = matter(raw);
    if (data.slug === slug || entry.replace(/\.md$/, "") === slug) {
      return p;
    }
  }
  throw new Error(`Article not found for vertical=${vertical} slug=${slug}`);
}

async function archiveReviewRequest(slug: string, vertical: string, requestPath: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(REVIEW_ARCHIVE_ROOT, slug, stamp);
  await mkdir(dest, { recursive: true });
  await rename(requestPath, join(dest, "review-request.json"));
}

async function regenerateImage(slug: string, articleFilename: string, context: string): Promise<void> {
  return await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npm",
      ["start", "--", "--force", "--file", articleFilename, "--revision-context", context],
      { cwd: IMAGE_AGENT_PATH, stdio: "inherit" }
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`image-agent exited with code ${code} for slug=${slug}`));
    });
  });
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));

  const jobOpts: WriteJobOptions | null = opts.jobId
    ? {
        jobId: opts.jobId,
        jobsDir: REVIEW_JOBS_ROOT,
        slug: opts.slug,
        vertical: opts.vertical,
        logPath: join(REVIEW_JOBS_ROOT, `${opts.jobId}.log`),
      }
    : null;

  const update = async (status: "running" | "done" | "error", current_step?: string, error?: string) => {
    if (jobOpts) await writeJobUpdate(jobOpts, { status, current_step, error });
  };

  try {
    await update("running", "reading inputs");
    const articlePath = await findArticleFile(opts.vertical, opts.slug);
    const requestPath = join(REVIEW_REQUESTS_ROOT, opts.vertical, `${opts.slug}.review-request.json`);
    const request = JSON.parse(await readFile(requestPath, "utf-8")) as ReviewRequest;
    const articleRaw = await readFile(articlePath, "utf-8");
    const articleParsed = matter(articleRaw);

    await update("running", "calling LLM");
    const { system, user } = buildPrompt({
      articleBody: matter.stringify(articleParsed.content, {}).replace(/^---\s*\n---\s*\n/, ""),
      request,
    });
    const llm = new ClaudeCLIProvider();
    const revised = await llm.generate(user, system);

    await update("running", "validating");
    const validation = validateRevision({
      original: articleParsed.content,
      revised,
    });
    if (!validation.ok) {
      await update("error", "validating", validation.reason);
      process.exit(1);
    }

    await update("running", "writing revised draft");
    await publishRevision({
      articlePath,
      revisedBody: revised,
      archiveRoot: REVIEW_ARCHIVE_ROOT,
      slug: opts.slug,
    });
    await archiveReviewRequest(opts.slug, opts.vertical, requestPath);

    if (request.image.regenerate && request.image.context) {
      await update("running", "regenerating image");
      try {
        const articleFilename = articlePath.split("/").slice(-1)[0]!;
        await regenerateImage(opts.slug, articleFilename, request.image.context);
      } catch (e) {
        // Image failure does not roll back the article revision.
        const msg = e instanceof Error ? e.message : String(e);
        await update("done", "completed (image regen failed: " + msg + ")");
        process.exit(0);
      }
    }

    await update("done", "completed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (jobOpts) await writeJobUpdate(jobOpts, { status: "error", error: msg });
    console.error(msg);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Sanity-check the file compiles**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && \
  git add src/index.ts && \
  git commit -m "feat(reviser): CLI orchestration in index.ts"
```

---

### Task 1.9: End-to-end smoke test (manual, on a real article)

This validates the agent works against a real article without any UI. We'll synthesize a fake review-request.json by hand.

**Files:**
- Create temporarily: `~/Desktop/ssnn-outputs/review-requests/sport/the-fight-that-refused-to-be-one-thing.review-request.json`

- [ ] **Step 1: Pick the test article**

We'll use one of the two 2026-05-10 sport articles. Use `the-fight-that-refused-to-be-one-thing` since it's the smaller of the two.

- [ ] **Step 2: Make sure it's currently `status: pending`**

```bash
grep "status:" "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/src/content/sport/2026-05-10-the-fight-that-refused-to-be-one-thing.md"
```

If it's not `pending`, set it back manually so we have a real revision target.

- [ ] **Step 3: Write the synthetic review-request JSON**

```bash
mkdir -p ~/Desktop/ssnn-outputs/review-requests/sport
cat > ~/Desktop/ssnn-outputs/review-requests/sport/the-fight-that-refused-to-be-one-thing.review-request.json <<'EOF'
{
  "slug": "the-fight-that-refused-to-be-one-thing",
  "vertical": "sport",
  "round": 1,
  "submitted_at": "2026-05-10T16:00:00.000Z",
  "overall_notes": "The second half feels rushed — pull more weight onto Dubois's mental shift between rounds, less on round-by-round mechanics.",
  "inline_comments": [],
  "image": { "regenerate": false, "context": null }
}
EOF
```

- [ ] **Step 4: Run the agent without a job ID (one-shot mode)**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && \
  npm start -- --slug the-fight-that-refused-to-be-one-thing --vertical sport
```

Expected: ~30s of work; on success, exit code 0; the article body is rewritten; `revision_round: 1` and `last_revised_at` appear in frontmatter; the `.review-request.json` is gone (moved to archive); a new entry appears under `~/Desktop/ssnn-outputs/review-archive/the-fight-that-refused-to-be-one-thing/`.

- [ ] **Step 5: Verify the result**

```bash
head -20 "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/src/content/sport/2026-05-10-the-fight-that-refused-to-be-one-thing.md"
ls ~/Desktop/ssnn-outputs/review-archive/the-fight-that-refused-to-be-one-thing/
```

Confirm: `status: pending`, `revision_round: 1`, archive directory has a timestamped folder containing `original.md` and `review-request.json`.

- [ ] **Step 6: If anything looks wrong, restore from archive and fix the agent**

```bash
# Recovery snippet (only run if the smoke test failed):
# cp ~/Desktop/ssnn-outputs/review-archive/the-fight-that-refused-to-be-one-thing/<stamp>/original.md \
#    "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/src/content/sport/2026-05-10-the-fight-that-refused-to-be-one-thing.md"
```

- [ ] **Step 7: Commit any agent fixes from this smoke test**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && \
  git status && git add -A && \
  git commit -m "fix(reviser): smoke-test corrections" || echo "nothing to commit"
```

---

## Phase 2 — Image-agent `--revision-context` flag

### Task 2.1: Add CLI flag parsing to image-agent

**Files:**
- Modify: `~/Desktop/ssnn-outputs/image-agent/src/index.ts`

- [ ] **Step 1: Read the current `parseCliArgs` and `CliOptions`**

```bash
grep -n "CliOptions\|parseCliArgs" ~/Desktop/ssnn-outputs/image-agent/src/index.ts | head
```

Locate the `CliOptions` type definition and the `parseCliArgs` function (around line 45–60 per earlier inspection).

- [ ] **Step 2: Add `revisionContext?: string` to the `CliOptions` interface**

In `src/index.ts`, find the `CliOptions` interface (or type alias). Add:

```ts
revisionContext?: string;
```

- [ ] **Step 3: Add the parser branch in `parseCliArgs`**

Inside the `for` loop in `parseCliArgs`, after the existing `--force` branch, add:

```ts
else if (arg === "--revision-context" && argv[i + 1]) opts.revisionContext = argv[++i]!;
```

- [ ] **Step 4: Surface the option to the runtime**

Find where `parseCliArgs(process.argv.slice(2))` is called and where individual options are propagated through the run. Pass `opts.revisionContext` down to whatever function calls `extractConcept` / `extractAbstractConcepts` / `extractSpotlightConcepts`.

The exact wiring depends on the existing structure. Goal: the concept extractor receives an optional `revisionContext: string | undefined` argument.

- [ ] **Step 5: Sanity-check the file compiles**

```bash
cd ~/Desktop/ssnn-outputs/image-agent && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ssnn-outputs/image-agent && \
  git add src/index.ts && \
  git commit -m "feat(image-agent): --revision-context flag for editor-driven re-gen"
```

---

### Task 2.2: Thread revision-context into concept extractors

**Files:**
- Modify: `~/Desktop/ssnn-outputs/image-agent/src/concept.ts`
- Modify: `~/Desktop/ssnn-outputs/image-agent/src/feature-concepts.ts`
- Modify: `~/Desktop/ssnn-outputs/image-agent/src/spotlight-concepts.ts`

- [ ] **Step 1: Modify `concept.ts`**

Locate the `extractConcept` (or equivalent) function. Add an optional `revisionContext?: string` parameter. Inside `buildUserMessage`, when `revisionContext` is non-empty, prepend a clearly-marked block:

```ts
function buildUserMessage(
  title: string,
  tags: string[],
  bodyExcerpt: string,
  revisionContext?: string
): string {
  const revisionBlock = revisionContext
    ? `EDITOR REVISION GUIDANCE (overrides the article body where they conflict):\n${revisionContext}\n\n`
    : "";
  return `${revisionBlock}Title: ${title}
Tags: ${tags.join(", ")}

Article excerpt:
"""
${bodyExcerpt}
"""

Respond with the JSON object only.`;
}
```

Update `extractConcept` to accept and pass through `revisionContext`.

- [ ] **Step 2: Apply the same pattern to `feature-concepts.ts`**

Find the user-message builder. Add the same `revisionContext` parameter and prepend the same `EDITOR REVISION GUIDANCE` block when non-empty.

- [ ] **Step 3: Apply the same pattern to `spotlight-concepts.ts`**

Same change — optional `revisionContext` parameter, prepended guidance block.

- [ ] **Step 4: Sanity-check compilation**

```bash
cd ~/Desktop/ssnn-outputs/image-agent && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ssnn-outputs/image-agent && \
  git add src/concept.ts src/feature-concepts.ts src/spotlight-concepts.ts && \
  git commit -m "feat(image-agent): thread revision-context into concept extractors"
```

---

### Task 2.3: Smoke-test image regen with revision-context

- [ ] **Step 1: Pick a target article whose image has a known problem**

The Itauma article (`2026-05-10-the-heavyweight-division-s-most-dangerous-man-is-the-one-nob.md`) currently has a "Mo Ali" problem. Perfect target.

- [ ] **Step 2: Force-regen with revision-context**

```bash
cd ~/Desktop/ssnn-outputs/image-agent && \
  npm start -- --force --file 2026-05-10-the-heavyweight-division-s-most-dangerous-man-is-the-one-nob.md \
  --revision-context "Make sure the boxer in the ring is Moses Itauma — young black British heavyweight, not Muhammad Ali. Tall, athletic, 21 years old. Modern boxing trunks, not vintage."
```

Expected: ~1 minute of work; new image written to `public/images/articles/the-heavyweight-division-s-most-dangerous-man-is-the-one-nob.png`.

- [ ] **Step 3: Eyeball the new image**

Open `the-heavyweight-division-s-most-dangerous-man-is-the-one-nob.png` and confirm the figure looks like a young modern heavyweight, not Mo Ali. If still wrong, the `revision-context` injection isn't reaching the concept extractor — check Step 4 of Task 2.1.

- [ ] **Step 4: Commit any fixes**

```bash
cd ~/Desktop/ssnn-outputs/image-agent && \
  git status && git add -A && git commit -m "fix(image-agent): smoke-test corrections" || echo "nothing to commit"
```

---

## Phase 3 — Site backend (`/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/`)

All paths in this phase are relative to the site repo root.

### Task 3.1: Shared types

**Files:**
- Create: `src/lib/revision/types.ts`

- [ ] **Step 1: Write the file**

```ts
// src/lib/revision/types.ts

/**
 * Mirrors ssnn-outputs/reviser-agent/src/types.ts.
 * Keep these two files in sync.
 */

export interface InlineComment {
  id: string;
  quote: string;
  paragraph_index: number;
  paragraph_text: string;
  preceding_context: string;
  following_context: string;
  comment: string;
  created_at: string;
}

export interface ImageRevision {
  regenerate: boolean;
  context: string | null;
}

export interface ReviewRequest {
  slug: string;
  vertical: "news" | "sport" | "tech" | "features";
  round: number;
  submitted_at: string;
  overall_notes: string;
  inline_comments: InlineComment[];
  image: ImageRevision;
}

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobRecord {
  id: string;
  slug: string;
  vertical: ReviewRequest["vertical"];
  status: JobStatus;
  current_step: string | null;
  started_at: string;
  updated_at: string;
  error: string | null;
  log_path: string;
}

export const VERTICALS = ["news", "sport", "tech", "features"] as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/revision/types.ts && \
  git commit -m "feat(revision): shared types"
```

---

### Task 3.2: Path helpers (env-driven)

**Files:**
- Create: `src/lib/revision/paths.ts`
- Modify (or create): `.env.local.example`

- [ ] **Step 1: Write `paths.ts`**

```ts
// src/lib/revision/paths.ts
import path from "node:path";

const HOME = process.env.HOME ?? "/Users/sandboxsansan";

export const REVIEW_REQUESTS_ROOT =
  process.env.SSNN_REVIEW_REQUESTS_ROOT
  ?? path.join(HOME, "Desktop/ssnn-outputs/review-requests");

export const REVIEW_JOBS_ROOT =
  process.env.SSNN_REVIEW_JOBS_ROOT
  ?? path.join(HOME, "Desktop/ssnn-outputs/review-jobs");

export const REVISER_AGENT_PATH =
  process.env.REVISER_AGENT_PATH
  ?? path.join(HOME, "Desktop/ssnn-outputs/reviser-agent");
```

- [ ] **Step 2: Add the variables to `.env.local.example`**

Append (or create the file with):

```
# Review revisions — agent paths.
# Override these only if your ssnn-outputs/ tree lives elsewhere.
# REVISER_AGENT_PATH=/Users/sandboxsansan/Desktop/ssnn-outputs/reviser-agent
# SSNN_REVIEW_REQUESTS_ROOT=/Users/sandboxsansan/Desktop/ssnn-outputs/review-requests
# SSNN_REVIEW_JOBS_ROOT=/Users/sandboxsansan/Desktop/ssnn-outputs/review-jobs
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/revision/paths.ts .env.local.example && \
  git commit -m "feat(revision): env-driven path helpers"
```

---

### Task 3.3: Request body validator (with TDD)

**Files:**
- Create: `src/lib/revision/validate.ts`
- Create: `src/lib/revision/validate.test.ts`
- Modify: `package.json` (add a test script if absent)

- [ ] **Step 1: Add a backend-test script to `package.json`**

We use Node's built-in `--test` for plain logic tests. UI components stay manual-only. Add to the `scripts` section:

```json
"test:lib": "node --import tsx --test src/lib/**/*.test.ts"
```

Add `tsx` to `devDependencies` if it's not already there:

```bash
npm install --save-dev tsx
```

(This is a dev-only addition. Communicate before installing if you'd rather avoid the dependency — fallback is to skip automated lib tests and rely on manual testing.)

- [ ] **Step 2: Write the failing test**

```ts
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
```

- [ ] **Step 3: Run — confirm failure**

```bash
npm run test:lib
```

Expected: failures from missing `./validate`.

- [ ] **Step 4: Implement `validate.ts`**

```ts
// src/lib/revision/validate.ts
import { VERTICALS } from "./types";
import type { ReviewRequest } from "./types";

export type ValidationResult =
  | { ok: true; body: Omit<ReviewRequest, "round" | "submitted_at"> }
  | { ok: false; error: string };

export function validateRevisionRequestBody(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Body must be an object." };
  }
  const body = input as Record<string, unknown>;

  if (typeof body.vertical !== "string" || !VERTICALS.includes(body.vertical as ReviewRequest["vertical"])) {
    return { ok: false, error: `Invalid vertical: ${body.vertical}` };
  }
  if (typeof body.slug !== "string" || !/^[a-z0-9-]+$/i.test(body.slug)) {
    return { ok: false, error: `Invalid slug: ${body.slug}` };
  }
  if (typeof body.overall_notes !== "string") {
    return { ok: false, error: "overall_notes must be a string." };
  }
  if (!Array.isArray(body.inline_comments)) {
    return { ok: false, error: "inline_comments must be an array." };
  }
  for (const c of body.inline_comments) {
    const cm = c as Record<string, unknown>;
    if (
      typeof cm.id !== "string" ||
      typeof cm.quote !== "string" ||
      typeof cm.paragraph_index !== "number" ||
      typeof cm.paragraph_text !== "string" ||
      typeof cm.preceding_context !== "string" ||
      typeof cm.following_context !== "string" ||
      typeof cm.comment !== "string" ||
      typeof cm.created_at !== "string"
    ) {
      return { ok: false, error: "Malformed inline comment." };
    }
  }
  if (typeof body.image !== "object" || body.image === null) {
    return { ok: false, error: "image must be an object." };
  }
  const image = body.image as Record<string, unknown>;
  if (typeof image.regenerate !== "boolean") {
    return { ok: false, error: "image.regenerate must be a boolean." };
  }
  if (image.context !== null && typeof image.context !== "string") {
    return { ok: false, error: "image.context must be a string or null." };
  }

  if (body.overall_notes.trim().length === 0 && body.inline_comments.length === 0) {
    return { ok: false, error: "Provide overall notes, at least one inline comment, or both." };
  }

  return {
    ok: true,
    body: {
      vertical: body.vertical as ReviewRequest["vertical"],
      slug: body.slug,
      overall_notes: body.overall_notes,
      inline_comments: body.inline_comments as ReviewRequest["inline_comments"],
      image: body.image as ReviewRequest["image"],
    },
  };
}
```

- [ ] **Step 5: Run — confirm pass**

```bash
npm run test:lib
```

Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/revision/validate.ts src/lib/revision/validate.test.ts package.json package-lock.json && \
  git commit -m "feat(revision): request body validator with TDD"
```

---

### Task 3.4: Job IO + reviser spawn helpers

**Files:**
- Create: `src/lib/revision/jobs.ts`

This file is integration glue (filesystem + child process). We do not unit-test this directly — manual testing via Task 5.1 covers it.

- [ ] **Step 1: Write `jobs.ts`**

```ts
// src/lib/revision/jobs.ts
import fs from "node:fs/promises";
import { openSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { REVIEW_JOBS_ROOT, REVISER_AGENT_PATH } from "./paths";
import type { JobRecord, JobStatus, ReviewRequest } from "./types";

export async function readJob(jobId: string): Promise<JobRecord | null> {
  try {
    const raw = await fs.readFile(path.join(REVIEW_JOBS_ROOT, `${jobId}.json`), "utf-8");
    return JSON.parse(raw) as JobRecord;
  } catch {
    return null;
  }
}

export async function findActiveJobFor(vertical: ReviewRequest["vertical"], slug: string): Promise<JobRecord | null> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(REVIEW_JOBS_ROOT);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(REVIEW_JOBS_ROOT, entry), "utf-8");
      const job = JSON.parse(raw) as JobRecord;
      if (
        job.vertical === vertical &&
        job.slug === slug &&
        (job.status === "queued" || job.status === "running")
      ) {
        return job;
      }
    } catch {
      // ignore malformed records
    }
  }
  return null;
}

export interface CreateJobInput {
  slug: string;
  vertical: ReviewRequest["vertical"];
}

export interface CreatedJob {
  jobId: string;
  logPath: string;
  recordPath: string;
}

export async function createJobRecord(input: CreateJobInput): Promise<CreatedJob> {
  await fs.mkdir(REVIEW_JOBS_ROOT, { recursive: true });
  const jobId = randomUUID();
  const recordPath = path.join(REVIEW_JOBS_ROOT, `${jobId}.json`);
  const logPath = path.join(REVIEW_JOBS_ROOT, `${jobId}.log`);
  const now = new Date().toISOString();
  const record: JobRecord = {
    id: jobId,
    slug: input.slug,
    vertical: input.vertical,
    status: "queued",
    current_step: "queued",
    started_at: now,
    updated_at: now,
    error: null,
    log_path: logPath,
  };
  await fs.writeFile(recordPath, JSON.stringify(record, null, 2), "utf-8");
  return { jobId, logPath, recordPath };
}

export interface SpawnReviserInput {
  jobId: string;
  slug: string;
  vertical: ReviewRequest["vertical"];
  logPath: string;
}

export function spawnReviser(input: SpawnReviserInput): void {
  const logFd = openSync(input.logPath, "a");
  const child = spawn(
    "npm",
    ["start", "--", "--slug", input.slug, "--vertical", input.vertical, "--job-id", input.jobId],
    {
      cwd: REVISER_AGENT_PATH,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:${process.env.PATH ?? ""}`,
      },
    }
  );
  child.unref();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/revision/jobs.ts && \
  git commit -m "feat(revision): job IO + reviser spawn helpers"
```

---

### Task 3.5: POST `/api/review/revision`

**Files:**
- Create: `src/app/api/review/revision/route.ts`

- [ ] **Step 1: Write the route handler**

```ts
// src/app/api/review/revision/route.ts
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { validateRevisionRequestBody } from "@/lib/revision/validate";
import {
  createJobRecord,
  findActiveJobFor,
  spawnReviser,
} from "@/lib/revision/jobs";
import { REVIEW_REQUESTS_ROOT } from "@/lib/revision/paths";
import type { ReviewRequest } from "@/lib/revision/types";

const CONTENT_ROOT = path.join(process.cwd(), "src/content");

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Not available in production" },
      { status: 403 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateRevisionRequestBody(raw);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }
  const { vertical, slug } = validation.body;

  const articlePath = await findArticleFile(vertical, slug);
  if (!articlePath) {
    return NextResponse.json(
      { ok: false, error: `Article not found for ${vertical}/${slug}` },
      { status: 404 }
    );
  }

  const existing = await findActiveJobFor(vertical, slug);
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "Article is already in revision.", jobId: existing.id },
      { status: 409 }
    );
  }

  const articleRaw = await fs.readFile(articlePath, "utf-8");
  const parsed = matter(articleRaw);
  const round = typeof parsed.data.revision_round === "number" ? parsed.data.revision_round + 1 : 1;

  const fullRequest: ReviewRequest = {
    vertical,
    slug,
    round,
    submitted_at: new Date().toISOString(),
    overall_notes: validation.body.overall_notes,
    inline_comments: validation.body.inline_comments,
    image: validation.body.image,
  };

  const requestDir = path.join(REVIEW_REQUESTS_ROOT, vertical);
  await fs.mkdir(requestDir, { recursive: true });
  const requestPath = path.join(requestDir, `${slug}.review-request.json`);
  await fs.writeFile(requestPath, JSON.stringify(fullRequest, null, 2), "utf-8");

  parsed.data.status = "revision-requested";
  await fs.writeFile(articlePath, matter.stringify(parsed.content, parsed.data), "utf-8");

  const job = await createJobRecord({ slug, vertical });
  spawnReviser({
    jobId: job.jobId,
    slug,
    vertical,
    logPath: job.logPath,
  });

  return NextResponse.json({ ok: true, jobId: job.jobId, status: "queued" });
}

async function findArticleFile(
  vertical: ReviewRequest["vertical"],
  slug: string
): Promise<string | null> {
  const dir = path.join(CONTENT_ROOT, vertical);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const filePath = path.join(dir, entry);
    const raw = await fs.readFile(filePath, "utf-8");
    const { data } = matter(raw);
    if (data.slug === slug || entry.replace(/\.md$/, "") === slug) {
      return filePath;
    }
  }
  return null;
}
```

- [ ] **Step 2: Manual smoke test with curl**

Start the dev server (in another terminal):

```bash
cd "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily" && npm run dev
```

Then POST a synthetic body:

```bash
curl -i -X POST http://localhost:3000/api/review/revision \
  -H "Content-Type: application/json" \
  -d '{
    "vertical": "sport",
    "slug": "the-fight-that-refused-to-be-one-thing",
    "overall_notes": "Tighten the ending.",
    "inline_comments": [],
    "image": { "regenerate": false, "context": null }
  }'
```

Expected: `200 OK` with `{ ok: true, jobId: "...", status: "queued" }`. Article frontmatter should now read `status: revision-requested`. The reviser should be running in the background — tail its log:

```bash
tail -f ~/Desktop/ssnn-outputs/review-jobs/<jobId>.log
```

- [ ] **Step 3: Test the 409 path**

While the first job is running, fire the same curl again. Expected: `409 Conflict` with `{ ok: false, error: "Article is already in revision." }`.

- [ ] **Step 4: Test the dev-only gate**

```bash
NODE_ENV=production curl -i -X POST http://localhost:3000/api/review/revision \
  -H "Content-Type: application/json" -d '{}'
```

(This won't actually trigger the production check since the running server is dev — instead, temporarily edit the route to hardcode `if (true)` once and verify the 403 response, then revert.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/review/revision/route.ts && \
  git commit -m "feat(api): POST /api/review/revision endpoint"
```

---

### Task 3.6: GET `/api/review/revision/status`

**Files:**
- Create: `src/app/api/review/revision/status/route.ts`

- [ ] **Step 1: Write the route handler**

```ts
// src/app/api/review/revision/status/route.ts
import { NextResponse } from "next/server";
import { readJob } from "@/lib/revision/jobs";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Not available in production" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id || !/^[a-f0-9-]+$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });
  }

  const job = await readJob(id);
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, job });
}
```

- [ ] **Step 2: Manual smoke test**

After kicking off a job in Task 3.5, poll its status:

```bash
curl -s "http://localhost:3000/api/review/revision/status?id=<jobId>" | jq
```

Expected: a JSON envelope `{ ok: true, job: { ... } }` reflecting the current state.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/review/revision/status/route.ts && \
  git commit -m "feat(api): GET /api/review/revision/status"
```

---

### Task 3.7: Revision-round badge in the review queue

**Files:**
- Modify: `src/lib/articles.ts` (or wherever `getPendingArticles` and the article type live)
- Modify: `src/app/review/page.tsx`

- [ ] **Step 1: Inspect the article type and `getPendingArticles`**

```bash
grep -n "getPendingArticles\|revision_round\|interface Article" src/lib/articles.ts
```

- [ ] **Step 2: Add `revisionRound` to the article type**

In `src/lib/articles.ts` (or `src/lib/types.ts` — wherever the type is defined), add:

```ts
revisionRound?: number;
```

When parsing frontmatter, populate it from `data.revision_round` (number). If absent, leave undefined.

- [ ] **Step 3: Update the review queue tile**

In `src/app/review/page.tsx`, on the `<li>` tile for each pending article, change the meta line:

```tsx
<p className="font-mono text-meta-sm uppercase tracking-mono-wide text-orange mb-2">
  {config.label} · PENDING
  {article.revisionRound && article.revisionRound > 0
    ? ` · ROUND ${article.revisionRound + 1}`
    : ""}
</p>
```

Note: we display `revision_round + 1` because `revision_round: 1` means "round 2 of editing" from the editor's POV (round 1 was the original draft).

- [ ] **Step 4: Manual visual check**

Open `http://localhost:3000/review` after a successful revision. Confirm the tile shows "ROUND 2" badge for the revised article.

- [ ] **Step 5: Commit**

```bash
git add src/lib/articles.ts src/app/review/page.tsx && \
  git commit -m "feat(review): show revision-round badge in queue"
```

---

## Phase 4 — Site UI (annotation flow)

All client components in this phase live under `src/app/review/[vertical]/[slug]/`.

### Task 4.1: `useAnnotations` hook

**Files:**
- Create: `src/app/review/[vertical]/[slug]/use-annotations.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/app/review/[vertical]/[slug]/use-annotations.ts
"use client";

import { useCallback, useState } from "react";
import type { InlineComment } from "@/lib/revision/types";

export type DraftComment = Omit<InlineComment, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export interface UseAnnotationsResult {
  comments: InlineComment[];
  addComment: (draft: DraftComment) => InlineComment;
  updateComment: (id: string, comment: string) => void;
  removeComment: (id: string) => void;
  clearAll: () => void;
}

let counter = 0;
const newId = () => {
  counter += 1;
  return `c${Date.now()}-${counter}`;
};

export function useAnnotations(): UseAnnotationsResult {
  const [comments, setComments] = useState<InlineComment[]>([]);

  const addComment = useCallback((draft: DraftComment): InlineComment => {
    const id = draft.id ?? newId();
    const created_at = draft.created_at ?? new Date().toISOString();
    const next: InlineComment = {
      id,
      created_at,
      quote: draft.quote,
      paragraph_index: draft.paragraph_index,
      paragraph_text: draft.paragraph_text,
      preceding_context: draft.preceding_context,
      following_context: draft.following_context,
      comment: draft.comment,
    };
    setComments((prev) => sortByParagraphThenOffset([...prev, next]));
    return next;
  }, []);

  const updateComment = useCallback((id: string, comment: string) => {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, comment } : c)));
  }, []);

  const removeComment = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => setComments([]), []);

  return { comments, addComment, updateComment, removeComment, clearAll };
}

function sortByParagraphThenOffset(list: InlineComment[]): InlineComment[] {
  return [...list].sort((a, b) => a.paragraph_index - b.paragraph_index);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/review/[vertical]/[slug]/use-annotations.ts && \
  git commit -m "feat(annotations): useAnnotations hook"
```

---

### Task 4.2: `AnnotatableArticle` — text selection + popover trigger

**Files:**
- Create: `src/app/review/[vertical]/[slug]/AnnotatableArticle.tsx`

This component wraps the article body and:
- Tracks cursor selection on the article body
- Shows a `<CommentPopover>` when text is selected
- Renders existing comments as `<mark>`-wrapped highlights with numbered superscripts
- Refuses overlapping selections

- [ ] **Step 1: Write the component**

```tsx
// src/app/review/[vertical]/[slug]/AnnotatableArticle.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { InlineComment } from "@/lib/revision/types";
import { CommentPopover } from "./CommentPopover";

interface SelectionInfo {
  paragraphIndex: number;
  charOffset: number;
  quote: string;
  rect: DOMRect;
  paragraphText: string;
  precedingContext: string;
  followingContext: string;
}

interface Props {
  bodyHtml: string;
  comments: InlineComment[];
  onAddComment: (draft: {
    quote: string;
    paragraph_index: number;
    paragraph_text: string;
    preceding_context: string;
    following_context: string;
    comment: string;
  }) => void;
  onEditComment: (id: string) => void;
  highlightedId: string | null;
}

export function AnnotatableArticle({
  bodyHtml,
  comments,
  onAddComment,
  onEditComment,
  highlightedId,
}: Props) {
  const articleRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);

  useEffect(() => {
    const handler = () => setSelection(captureSelection(articleRef.current, comments));
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [comments]);

  useEffect(() => {
    if (!articleRef.current) return;
    applyHighlights(articleRef.current, comments, onEditComment);
  }, [bodyHtml, comments, onEditComment]);

  useEffect(() => {
    if (!articleRef.current || !highlightedId) return;
    const el = articleRef.current.querySelector<HTMLElement>(`[data-comment-id="${highlightedId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-orange");
      setTimeout(() => el.classList.remove("ring-2", "ring-orange"), 1500);
    }
  }, [highlightedId]);

  const onAdd = () => {
    if (!selection) return;
    onAddComment({
      quote: selection.quote,
      paragraph_index: selection.paragraphIndex,
      paragraph_text: selection.paragraphText,
      preceding_context: selection.precedingContext,
      following_context: selection.followingContext,
      comment: "",
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="relative">
      <div
        ref={articleRef}
        className="prose prose-stone max-w-reading"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      {selection && <CommentPopover rect={selection.rect} onClick={onAdd} />}
    </div>
  );
}

function captureSelection(
  root: HTMLElement | null,
  comments: InlineComment[]
): SelectionInfo | null {
  if (!root) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const quote = sel.toString().trim();
  if (!quote) return null;

  const paragraph = findParagraph(range.commonAncestorContainer, root);
  if (!paragraph) return null;

  const paragraphs = Array.from(root.querySelectorAll("p,h1,h2,h3,h4,blockquote,li"));
  const paragraphIndex = paragraphs.indexOf(paragraph);
  if (paragraphIndex < 0) return null;

  if (overlapsExistingHighlight(range, root)) return null;

  const paragraphText = paragraph.textContent ?? "";
  const precedingContext = paragraphs[paragraphIndex - 1]?.textContent ?? "";
  const followingContext = paragraphs[paragraphIndex + 1]?.textContent ?? "";

  const charOffset = paragraphText.indexOf(quote);

  return {
    paragraphIndex,
    charOffset: charOffset >= 0 ? charOffset : 0,
    quote,
    rect: range.getBoundingClientRect(),
    paragraphText,
    precedingContext,
    followingContext,
  };
}

function findParagraph(node: Node, root: HTMLElement): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const el = cur as HTMLElement;
      if (["P", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "LI"].includes(el.tagName)) {
        return el;
      }
    }
    cur = cur.parentNode;
  }
  return null;
}

function overlapsExistingHighlight(range: Range, root: HTMLElement): boolean {
  const marks = root.querySelectorAll("mark[data-comment-id]");
  for (const mark of Array.from(marks)) {
    const r = document.createRange();
    r.selectNode(mark);
    const startsInside =
      range.compareBoundaryPoints(Range.START_TO_START, r) >= 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, r) <= 0;
    const endsInside =
      range.compareBoundaryPoints(Range.END_TO_START, r) >= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, r) <= 0;
    const wraps =
      range.compareBoundaryPoints(Range.START_TO_START, r) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, r) >= 0;
    if (startsInside || endsInside || wraps) return true;
  }
  return false;
}

function applyHighlights(
  root: HTMLElement,
  comments: InlineComment[],
  onEditComment: (id: string) => void
): void {
  // Strip prior marks first.
  root.querySelectorAll("mark[data-comment-id]").forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
  });

  const paragraphs = Array.from(root.querySelectorAll("p,h1,h2,h3,h4,blockquote,li"));
  comments.forEach((c, idx) => {
    const para = paragraphs[c.paragraph_index];
    if (!para) return;
    wrapFirstMatchingTextNode(para, c.quote, c.id, idx + 1, onEditComment);
  });
}

function wrapFirstMatchingTextNode(
  paragraph: Element,
  quote: string,
  commentId: string,
  number: number,
  onEditComment: (id: string) => void
): void {
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let node: Text | null = walker.nextNode() as Text | null;
  while (node) {
    const idx = node.textContent?.indexOf(quote) ?? -1;
    if (idx >= 0 && node.textContent) {
      const before = node.textContent.slice(0, idx);
      const after = node.textContent.slice(idx + quote.length);
      const mark = document.createElement("mark");
      mark.dataset.commentId = commentId;
      mark.style.backgroundColor = "rgba(231, 93, 49, 0.20)";
      mark.style.cursor = "pointer";
      mark.appendChild(document.createTextNode(quote));

      const sup = document.createElement("sup");
      sup.textContent = String(number);
      sup.style.color = "#E75D31";
      sup.style.fontWeight = "700";
      sup.style.marginLeft = "2px";
      mark.appendChild(sup);

      mark.addEventListener("click", (e) => {
        e.stopPropagation();
        onEditComment(commentId);
      });

      const parent = node.parentNode;
      if (!parent) return;
      parent.insertBefore(document.createTextNode(before), node);
      parent.insertBefore(mark, node);
      parent.insertBefore(document.createTextNode(after), node);
      parent.removeChild(node);
      return;
    }
    node = walker.nextNode() as Text | null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/review/[vertical]/[slug]/AnnotatableArticle.tsx && \
  git commit -m "feat(annotations): AnnotatableArticle component"
```

---

### Task 4.3: `CommentPopover`

**Files:**
- Create: `src/app/review/[vertical]/[slug]/CommentPopover.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/review/[vertical]/[slug]/CommentPopover.tsx
"use client";

interface Props {
  rect: DOMRect;
  onClick: () => void;
}

export function CommentPopover({ rect, onClick }: Props) {
  const top = rect.top + window.scrollY - 44;
  const left = rect.left + window.scrollX + rect.width / 2 - 60;

  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Prevent the click from collapsing the selection before our handler runs.
        e.preventDefault();
      }}
      onClick={onClick}
      style={{
        position: "absolute",
        top,
        left,
        zIndex: 50,
      }}
      className="border-2 border-ink bg-cream px-3 py-1.5 rounded-sharp shadow-md font-mono text-meta-sm uppercase tracking-mono-wide hover:bg-ink hover:text-cream transition-colors"
    >
      💬 Comment
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/review/[vertical]/[slug]/CommentPopover.tsx && \
  git commit -m "feat(annotations): CommentPopover floating button"
```

---

### Task 4.4: `InlineCommentEditor` (within drawer)

The inline editor for an existing comment lives inside the drawer's comment list — clicking a highlight opens it focused. We'll build it as part of the drawer in Task 4.5 rather than a separate component (since it never floats independently).

This task is a no-op placeholder so the task numbering matches the design phases. Skip and move to 4.5.

---

### Task 4.5: `RevisionPanel` drawer

**Files:**
- Create: `src/app/review/[vertical]/[slug]/RevisionPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/review/[vertical]/[slug]/RevisionPanel.tsx
"use client";

import { useState } from "react";
import type { InlineComment } from "@/lib/revision/types";

interface Props {
  comments: InlineComment[];
  overallNotes: string;
  setOverallNotes: (s: string) => void;
  imageRegen: boolean;
  setImageRegen: (b: boolean) => void;
  imageContext: string;
  setImageContext: (s: string) => void;
  highlightCommentId: (id: string) => void;
  updateComment: (id: string, comment: string) => void;
  removeComment: (id: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

export function RevisionPanel({
  comments,
  overallNotes,
  setOverallNotes,
  imageRegen,
  setImageRegen,
  imageContext,
  setImageContext,
  highlightCommentId,
  updateComment,
  removeComment,
  onCancel,
  onSubmit,
  submitting,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const canSubmit =
    !submitting && (overallNotes.trim().length > 0 || comments.length > 0);

  return (
    <aside
      className="fixed right-0 top-0 h-screen w-[360px] bg-cream border-l-2 border-ink overflow-y-auto z-40 p-6"
      aria-label="Revision drawer"
    >
      <header className="border-b-2 border-ink pb-4 mb-4">
        <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-orange">
          REQUEST REVISION
        </p>
      </header>

      <section className="mb-6">
        <label className="font-mono text-meta-sm uppercase tracking-mono-wide block mb-2">
          Overall notes
        </label>
        <textarea
          className="w-full border-2 border-ink rounded-sharp p-2 font-body text-body min-h-[120px]"
          value={overallNotes}
          onChange={(e) => setOverallNotes(e.target.value)}
          placeholder="Anything you want to say about the piece overall."
          disabled={submitting}
        />
      </section>

      <section className="mb-6">
        <p className="font-mono text-meta-sm uppercase tracking-mono-wide mb-2">
          Inline comments ({comments.length})
        </p>
        {comments.length === 0 && (
          <p className="font-body text-meta text-grey">
            Drag-select any text in the article to add a comment.
          </p>
        )}
        <ul className="space-y-3">
          {comments.map((c, idx) => (
            <li
              key={c.id}
              className="border-2 border-ink p-3 rounded-sharp cursor-pointer"
              onClick={() => highlightCommentId(c.id)}
            >
              <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-orange mb-1">
                {idx + 1} · ¶{c.paragraph_index + 1}
              </p>
              <p className="font-body text-meta italic mb-2">"{c.quote}"</p>
              {editingId === c.id ? (
                <textarea
                  className="w-full border-2 border-ink rounded-sharp p-2 font-body text-body"
                  value={c.comment}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateComment(c.id, e.target.value)}
                  onBlur={() => setEditingId(null)}
                  disabled={submitting}
                />
              ) : (
                <p
                  className="font-body text-body"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(c.id);
                  }}
                >
                  {c.comment || <span className="text-grey">(click to add comment)</span>}
                </p>
              )}
              <button
                type="button"
                className="mt-2 text-meta-sm font-mono uppercase text-grey hover:text-orange"
                onClick={(e) => {
                  e.stopPropagation();
                  removeComment(c.id);
                }}
                disabled={submitting}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <label className="flex items-center gap-2 font-mono text-meta-sm uppercase tracking-mono-wide cursor-pointer">
          <input
            type="checkbox"
            checked={imageRegen}
            onChange={(e) => setImageRegen(e.target.checked)}
            disabled={submitting}
          />
          Also regenerate the image
        </label>
        {imageRegen && (
          <textarea
            className="mt-2 w-full border-2 border-ink rounded-sharp p-2 font-body text-body min-h-[80px]"
            placeholder="What to change about the image (e.g., 'make sure it's Itauma, not Mo Ali')"
            value={imageContext}
            onChange={(e) => setImageContext(e.target.value)}
            disabled={submitting}
          />
        )}
      </section>

      <footer className="flex gap-2 pt-4 border-t-2 border-ink">
        <button
          type="button"
          className="flex-1 border-2 border-ink py-2 font-mono uppercase tracking-mono-wide hover:bg-ink hover:text-cream"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="flex-1 bg-ink text-cream py-2 font-mono uppercase tracking-mono-wide disabled:opacity-50"
          onClick={onSubmit}
          disabled={!canSubmit}
        >
          {submitting ? "Sending..." : "Send to reviser"}
        </button>
      </footer>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/review/[vertical]/[slug]/RevisionPanel.tsx && \
  git commit -m "feat(annotations): RevisionPanel drawer with overall notes + comments + image toggle"
```

---

### Task 4.6: `RevisionStatus` polling banner

**Files:**
- Create: `src/app/review/[vertical]/[slug]/RevisionStatus.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/review/[vertical]/[slug]/RevisionStatus.tsx
"use client";

import { useEffect, useState } from "react";
import type { JobRecord } from "@/lib/revision/types";

interface Props {
  jobId: string;
  onDone: () => void;
  onError: (error: string) => void;
}

const POLL_INTERVAL_MS = 2000;
const MAX_DURATION_MS = 5 * 60_000;

export function RevisionStatus({ jobId, onDone, onError }: Props) {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/review/revision/status?id=${jobId}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "Status check failed");
        const j = json.job as JobRecord;
        setJob(j);
        if (j.status === "done") {
          onDone();
          return;
        }
        if (j.status === "error") {
          onError(j.error ?? "Reviser reported error");
          return;
        }
        if (Date.now() - start > MAX_DURATION_MS) {
          setStuck(true);
          return;
        }
        setTimeout(tick, POLL_INTERVAL_MS);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        onError(msg);
      }
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [jobId, onDone, onError]);

  if (stuck) {
    return (
      <div className="border-2 border-ink bg-cream p-6 my-6 rounded-sharp">
        <p className="font-mono text-meta uppercase tracking-mono-wide text-orange mb-2">
          Job appears stuck
        </p>
        <p className="font-body text-body">
          Last update: {job?.current_step ?? "unknown"}.
        </p>
        <p className="font-mono text-meta-sm text-grey mt-2">
          Logs: <code>{job?.log_path}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="border-2 border-ink bg-cream p-6 my-6 rounded-sharp">
      <p className="font-mono text-meta uppercase tracking-mono-wide text-orange mb-2 animate-pulse">
        Re-drafting...
      </p>
      <p className="font-body text-body">{humanise(job?.current_step ?? "queued")}</p>
    </div>
  );
}

function humanise(step: string): string {
  switch (step) {
    case "queued": return "Queued.";
    case "starting": return "Starting up...";
    case "reading inputs": return "Reading your comments...";
    case "calling LLM": return "Asking the model for a fresh draft...";
    case "validating": return "Checking the output is sane...";
    case "writing revised draft": return "Writing the new draft...";
    case "regenerating image": return "Generating a new image...";
    case "completed": return "Almost done...";
    default: return step;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/review/[vertical]/[slug]/RevisionStatus.tsx && \
  git commit -m "feat(annotations): RevisionStatus polling banner"
```

---

### Task 4.7: Wire it all into `[slug]/page.tsx`

**Files:**
- Modify: `src/app/review/[vertical]/[slug]/page.tsx`

The existing page is a server component that renders the article + Approve/Reject buttons. We need to convert just the action area into a client component that can hold annotation state.

- [ ] **Step 1: Inspect the current page structure**

```bash
cat "src/app/review/[vertical]/[slug]/page.tsx"
```

- [ ] **Step 2: Create a `ReviewActions.tsx` client component**

```tsx
// src/app/review/[vertical]/[slug]/ReviewActions.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewRequest, InlineComment } from "@/lib/revision/types";
import { useAnnotations } from "./use-annotations";
import { AnnotatableArticle } from "./AnnotatableArticle";
import { RevisionPanel } from "./RevisionPanel";
import { RevisionStatus } from "./RevisionStatus";

type Mode = "default" | "annotating" | "submitting";

interface Props {
  vertical: ReviewRequest["vertical"];
  slug: string;
  articleHtml: string;
}

export function ReviewActions({ vertical, slug, articleHtml }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("default");
  const [overallNotes, setOverallNotes] = useState("");
  const [imageRegen, setImageRegen] = useState(false);
  const [imageContext, setImageContext] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const annotations = useAnnotations();

  const callApi = async (action: "approve" | "reject") => {
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vertical, slug, action }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error ?? `Failed: ${action}`);
      return;
    }
    router.push("/review");
    router.refresh();
  };

  const submitRevision = async () => {
    setMode("submitting");
    setError(null);
    const res = await fetch("/api/review/revision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vertical,
        slug,
        overall_notes: overallNotes,
        inline_comments: annotations.comments,
        image: { regenerate: imageRegen, context: imageRegen ? imageContext : null },
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "Failed to submit revision");
      setMode("annotating");
      return;
    }
    setJobId(j.jobId);
  };

  const cancelAnnotation = () => {
    if (annotations.comments.length === 0 && overallNotes.trim().length === 0) {
      setMode("default");
      return;
    }
    setConfirmingCancel(true);
  };

  const confirmCancel = () => {
    annotations.clearAll();
    setOverallNotes("");
    setImageRegen(false);
    setImageContext("");
    setConfirmingCancel(false);
    setMode("default");
  };

  if (mode === "submitting" && jobId) {
    return (
      <RevisionStatus
        jobId={jobId}
        onDone={() => router.refresh()}
        onError={(msg) => {
          setError(msg);
          setMode("annotating");
          setJobId(null);
        }}
      />
    );
  }

  return (
    <>
      {mode === "annotating" ? (
        <AnnotatableArticle
          bodyHtml={articleHtml}
          comments={annotations.comments}
          onAddComment={(draft) => {
            const created = annotations.addComment(draft);
            setHighlightedId(created.id);
          }}
          onEditComment={(id) => setHighlightedId(id)}
          highlightedId={highlightedId}
        />
      ) : (
        <div
          className="prose prose-stone max-w-reading"
          dangerouslySetInnerHTML={{ __html: articleHtml }}
        />
      )}

      {mode === "annotating" && (
        <RevisionPanel
          comments={annotations.comments}
          overallNotes={overallNotes}
          setOverallNotes={setOverallNotes}
          imageRegen={imageRegen}
          setImageRegen={setImageRegen}
          imageContext={imageContext}
          setImageContext={setImageContext}
          highlightCommentId={setHighlightedId}
          updateComment={annotations.updateComment}
          removeComment={annotations.removeComment}
          onCancel={cancelAnnotation}
          onSubmit={submitRevision}
          submitting={false}
        />
      )}

      {mode === "default" && (
        <div className="flex gap-3 pt-8 border-t-2 border-ink mt-12">
          <button
            type="button"
            className="flex-1 bg-ink text-cream py-3 font-mono uppercase tracking-mono-wide"
            onClick={() => callApi("approve")}
          >
            Approve
          </button>
          <button
            type="button"
            className="flex-1 border-2 border-ink py-3 font-mono uppercase tracking-mono-wide hover:bg-ink hover:text-cream"
            onClick={() => setMode("annotating")}
          >
            Request revision
          </button>
          <button
            type="button"
            className="flex-1 border-2 border-ink py-3 font-mono uppercase tracking-mono-wide hover:bg-ink hover:text-cream"
            onClick={() => callApi("reject")}
          >
            Reject
          </button>
        </div>
      )}

      {error && (
        <p className="text-orange font-mono text-meta mt-4 border-2 border-orange p-3 rounded-sharp">
          {error}
        </p>
      )}

      {confirmingCancel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-cream border-2 border-ink p-6 rounded-sharp max-w-md">
            <p className="font-display text-2xl font-bold mb-3">
              Discard {annotations.comments.length} comment
              {annotations.comments.length === 1 ? "" : "s"}
              {overallNotes.trim().length > 0 ? " and your overall notes" : ""}?
            </p>
            <div className="flex gap-2 mt-4">
              <button
                className="flex-1 border-2 border-ink py-2 font-mono uppercase"
                onClick={() => setConfirmingCancel(false)}
              >
                Keep editing
              </button>
              <button
                className="flex-1 bg-ink text-cream py-2 font-mono uppercase"
                onClick={confirmCancel}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Modify `page.tsx` to use `ReviewActions`**

In `src/app/review/[vertical]/[slug]/page.tsx`:

1. Convert the article body rendering to pass the rendered HTML through to `<ReviewActions />` instead of rendering directly + standalone buttons.
2. Replace the existing approve/reject button block with `<ReviewActions vertical={vertical} slug={slug} articleHtml={articleHtml} />`.

The exact diff depends on the current shape — `cat` it and adapt. Keep the rest of the page (header metadata, hero image, etc.) untouched.

- [ ] **Step 4: Manual UI smoke test**

```bash
cd "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily" && npm run dev
```

Open `http://localhost:3000/review/sport/the-fight-that-refused-to-be-one-thing`. Confirm:
1. Three buttons render. Approve and Reject still work.
2. Click Request revision → drawer slides in, body becomes selectable.
3. Drag-select a phrase → 💬 popover appears → click → comment appears in drawer with placeholder.
4. Click the placeholder text in the drawer → typing area opens, you can write the comment.
5. Cancel → confirm dialog appears (because there's now content).
6. Submit (with overall notes only, no image regen) → status banner appears, polls, eventually reloads with the revised draft.

- [ ] **Step 5: Commit**

```bash
git add "src/app/review/[vertical]/[slug]/ReviewActions.tsx" "src/app/review/[vertical]/[slug]/page.tsx" && \
  git commit -m "feat(review): wire annotation flow into review page"
```

---

### Task 4.8: Cancel-with-confirm modal — already wired in Task 4.7

This is intentionally folded into `ReviewActions.tsx`. No additional task — verify it works during Task 4.7 step 4.

---

## Phase 5 — End-to-end + polish

### Task 5.1: Full end-to-end on the Itauma article

This is the test that proves the whole pipeline works for a real, end-to-end editorial flow.

- [ ] **Step 1: Reset the Itauma article to `pending`**

```bash
grep "status:" "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/src/content/sport/2026-05-10-the-heavyweight-division-s-most-dangerous-man-is-the-one-nob.md"
# If not pending, edit the frontmatter to set it back. Use git to view the original if needed.
```

- [ ] **Step 2: Restart dev server fresh**

```bash
cd "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily" && npm run dev
```

- [ ] **Step 3: Open the review page in a browser**

`http://localhost:3000/review/sport/the-heavyweight-division-s-most-dangerous-man-is-the-one-nob`

- [ ] **Step 4: Add real annotations**

- Drag-select a sentence near the middle of the piece.
- Add a comment like: "This pivot is the moment of the piece — give it more weight."
- Drag-select another sentence.
- Add: "This feels rushed; expand."
- In overall notes: "Tighten the second half."
- Tick "Also regenerate the image".
- In image-context: "Make sure the figure is Moses Itauma — young black British heavyweight, 21 years old. Not Muhammad Ali."

- [ ] **Step 5: Submit**

Click **Send to reviser**. Watch the status banner. ~30–60s later, the page reloads with a new draft.

- [ ] **Step 6: Eyeball the result**

- Read the new draft. Did the reviser address each comment specifically?
- Confirm `revision_round: 1` and `last_revised_at` are set in frontmatter.
- Open the new image. Does it look like Itauma now, not Mo Ali?
- Check the archive: `ls ~/Desktop/ssnn-outputs/review-archive/the-heavyweight-division-s-most-dangerous-man-is-the-one-nob/`

- [ ] **Step 7: If anything is off, iterate**

This is where real friction will show up. Common things to look for:
- Reviser mangled paragraph indices (off by one) — adjust paragraph counting in `AnnotatableArticle`.
- Highlighted text didn't survive scroll → comment edit (probably a re-render killing event listeners) — fix the `useEffect` dependencies in `AnnotatableArticle`.
- Image context was ignored — verify Phase 2 wiring.

- [ ] **Step 8: Commit any fixes**

```bash
git add -A && git commit -m "fix: end-to-end smoke-test corrections"
```

---

### Task 5.2: Document the new endpoints + paths in README

**Files:**
- Modify: `README.md` (or create a `docs/architecture/revisions.md`)

- [ ] **Step 1: Add a "Review Revisions" section to README**

Cover:
- What `/review` now supports (Approve / Request revision / Reject).
- Where review-request JSONs live (`~/Desktop/ssnn-outputs/review-requests/`).
- Where job records live.
- How to recover from archive.
- The dev-only constraint on the new endpoints.

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: document review revisions feature"
```

---

### Task 5.3: Final cleanup pass

- [ ] **Step 1: Run typecheck end-to-end**

```bash
cd "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily" && npx tsc --noEmit
cd ~/Desktop/ssnn-outputs/reviser-agent && npx tsc --noEmit
cd ~/Desktop/ssnn-outputs/image-agent && npx tsc --noEmit
```

Each: clean.

- [ ] **Step 2: Run all automated tests**

```bash
cd ~/Desktop/ssnn-outputs/reviser-agent && npm test
cd "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily" && npm run test:lib
```

Each: green.

- [ ] **Step 3: Run lint**

```bash
cd "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily" && npm run lint
```

Fix any complaints. Commit if any changes.

- [ ] **Step 4: Sanity check git log**

```bash
cd "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily" && git log --oneline -20
```

Confirm a clean, logical commit history. No `WIP`, no `xxx`, no half-finished commits.

---

## Coverage check (self-review against spec)

Mapping spec sections → tasks:

| Spec section | Tasks |
|---|---|
| §3.1 default state — three buttons | 4.7 |
| §3.2 annotation mode — drawer slides in | 4.5, 4.7 |
| §3.3 add inline comment — selection → popover → editor | 4.1, 4.2, 4.3, 4.5 |
| §3.4 selection constraints (overlap rejection) | 4.2 |
| §3.5 submit flow — async polling | 3.5, 3.6, 4.6, 4.7 |
| §3.6 cancel flow — confirm modal | 4.7 |
| §4.1 frontmatter state machine | 1.7, 3.5 |
| §4.2–4.3 review-request JSON shape + linkage | 3.1, 3.5, 1.6 |
| §4.4 storage location | 3.2, 3.5 |
| §4.5 archive | 1.7 |
| §5 reviser-agent | 1.1–1.9 |
| §5.4 output validation (4 rules) | 1.5 |
| §5.5 prompt design | 1.6 |
| §5.6 image regen wiring | 1.8, 2.1–2.3 |
| §6.1 POST /api/review/revision | 3.5 |
| §6.1 GET status endpoint | 3.6 |
| §6.4 concurrency (409 on duplicate) | 3.5 |
| §7 error handling | 1.5 (validator), 1.8 (LLM/image), 4.6 (UI), 4.7 (UI errors) |
| §8 testing approach | 1.3, 1.5, 1.6, 1.7, 3.3 (TDD); 1.9, 2.3, 5.1 (manual) |

No spec section is unimplemented.

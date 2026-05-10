# Review Revisions — Design Spec

**Status:** Approved (brainstorming complete, awaiting implementation plan)
**Author:** SanSan + Claude
**Date:** 2026-05-10

---

## 1. Context

The Sandbox Daily pipeline (writer-agent → editor-agent → image-agent) auto-publishes drafts as `status: pending`. The current `/review` page only supports two terminal actions: **Approve** (flip to `published`) or **Reject** (move files to `.review-discarded/`).

In practice, drafts are often *almost* right — the framing is off in one paragraph, a quote needs a different emphasis, the hero image misidentifies the subject. Today there is no way to give targeted feedback short of rejecting and rewriting the source research-doc, which is heavy-handed and loses the editorial work the pipeline already did.

This spec adds a third action: **Request revision** — an editor-style annotation flow that lets SanSan highlight passages, attach comments, and trigger a new agent (the **reviser-agent**) to produce a revised draft. The new draft re-enters the review queue at `pending` for fresh approval.

## 2. Goals & non-goals

### Goals
- Inline annotation: select any text in the article, attach a comment anchored to that selection, like Google Docs / Medium.
- Multiple annotations per article + a separate "overall notes" field.
- Optional image regeneration with user-supplied context guidance.
- Auto-trigger of the reviser-agent on submit; revised draft appears within ~30 seconds.
- Full preservation of the link between each highlighted passage and its comment, so the reviser has unambiguous context.
- All revisions archived; no editorial work ever lost.

### Non-goals (deferred polish)
- Auto-saving in-progress annotations across page reloads.
- Keyboard shortcuts (`Cmd+Enter` to save, `Esc` to dismiss).
- Side-by-side or diff comparison between revision rounds.
- Notifications outside the active review tab.
- Production access (revision endpoint stays dev-only via `NODE_ENV` check, matching the existing approve/reject endpoint).
- Auto-cleanup of job records and archived drafts.
- Round limits — no cap on revision rounds; rejecting is the escape hatch if a piece is fundamentally broken.

## 3. User experience

### 3.1 Default state on `/review/[vertical]/[slug]`

Below the rendered article body, three buttons in a row:

```
[ Approve ]   [ Request revision ]   [ Reject ]
```

Approve and Reject behave exactly as today (no changes to those flows).

### 3.2 Annotation mode

Clicking **Request revision** transitions the page into annotation mode:

1. The action buttons are replaced by **[ Cancel ]** and **[ Send to reviser ]**. The latter is disabled until at least one comment OR the overall-notes field is non-empty.
2. A **drawer slides in from the right** (~360px wide) containing:
   - **Overall notes** — a textarea, always visible. Use for whole-article feedback.
   - **Inline comments list** — empty initially, populates as the user adds highlights. Numbered to match in-article markers.
   - **☐ Also regenerate the image** — a toggle. When ticked, an **image-context textarea** appears below it, for guidance like "make sure it's actually Itauma — young black British heavyweight, southpaw stance".
3. The article body becomes annotation-enabled (cursor change indicates this).

### 3.3 Adding an inline comment

The flow follows the modern editor pattern (Medium / Notion / Substack):

1. User drag-selects text in the article body. Selection can span a single word, a phrase, a sentence, or a full paragraph.
2. A floating **💬 Comment** popover appears just above the selection.
3. Click the popover → an inline comment editor anchors near the selection. User types, clicks **Save**.
4. The selected text gets a subtle **cortex-orange background** (`#E75D31` at 20% opacity) plus a numbered superscript marker (`¹`, `²`, ...) at the end of the selection.
5. The same comment appears in the drawer's inline-comments list, numbered to match.
6. **Hover** an in-article highlight → tooltip shows the comment text.
7. **Click** an in-article highlight → reopens the editor for edit/delete.
8. **Click** a sidebar item → page scrolls to that highlight and pulses it once for orientation.

### 3.4 Constraints on selection

- Multiple non-overlapping highlights are allowed; numbered in document order.
- A new selection that **overlaps** an existing highlight is rejected (popover doesn't appear). Keeps the anchoring model sane in MVP.
- Selections are persisted only in component state until the user submits — there is no autosave to disk.

### 3.5 Submit flow

Clicking **Send to reviser**:

1. Drawer collapses; status banner replaces the article footer: **"Re-drafting... ~30s"** with an animated indicator.
2. Status line beneath the spinner updates as the reviser progresses ("Reading your comments...", "Calling the model...", "Generating new image...").
3. On success: toast **"New draft ready"** + the page reloads showing the new draft (`status: pending`, `revision_round` incremented, all annotations cleared).
4. On error: banner shows the failure message + a **Retry** button. Annotations stay loaded so no work is lost.
5. Polling auto-stops on terminal states or after a 5-minute wall-clock timeout (whichever comes first).

### 3.6 Cancel flow

- If the user has added any annotations or overall notes, clicking **Cancel** opens a confirmation modal: *"Discard 3 comments and your overall notes?"* with **[ Keep editing ]** and **[ Discard ]**.
- Confirmed cancel: drawer closes, all in-progress data cleared, page returns to default three-button state.
- Empty cancel (no notes added): exits annotation mode with no confirmation.

### 3.7 What the user does NOT do

- Does not run any command on the Mac mini.
- Does not interact with the agent codebase directly.
- Does not see job IDs, file paths, or process logs — those exist for debugging only.

## 4. Data model & link preservation

The principle: every inline comment carries enough context that the reviser-agent never has to guess what the editor meant.

### 4.1 Article frontmatter — state machine

Existing states: `pending`, `published`. Plus articles "removed entirely" via reject.

New state added: `revision-requested` (transient — set when revision is submitted; cleared when reviser writes the new draft and flips it back to `pending`).

```
pending  ──Approve───────────►  published
   │
   ├──Reject────────────────►  (moved to .review-discarded/)
   │
   └──Request revision──────►  revision-requested
                                       │
                                       ▼ (reviser-agent runs)
                                pending  (new draft, all annotations cleared,
                                          revision_round incremented)
```

Two new frontmatter fields:
- `revision_round: number` — increments on every successful revision. Defaults to absent (treat as 0) on first-time articles.
- `last_revised_at: ISO-8601 string` — set by the reviser-agent on successful revision.

The review queue UI shows `revision_round: N` as a badge on articles where it's > 0 ("round 2", "round 3") so SanSan knows at a glance.

### 4.2 Review request JSON sidecar

For each in-flight revision, a JSON file at `~/Desktop/ssnn-outputs/review-requests/{vertical}/{slug}.review-request.json`:

```json
{
  "slug": "the-heavyweight-division-s-most-dangerous-man-is-the-one-nob",
  "vertical": "sport",
  "round": 1,
  "submitted_at": "2026-05-10T15:42:11.000Z",
  "overall_notes": "Whole second half drifts. Tighten back to the 'nobody wants to schedule him' angle.",
  "inline_comments": [
    {
      "id": "c1",
      "quote": "And then there's Moses Itauma.",
      "paragraph_index": 4,
      "paragraph_text": "And then there's Moses Itauma.",
      "preceding_context": "...Wardley is threading himself into the WBO belt picture after fighting just this past week — though the result of that fight carries a whiff of controversy that nobody seems eager to examine under bright lights.",
      "following_context": "Young. Categorised as a prospect. Already framed as Britain's next great heavyweight hope...",
      "comment": "Make this hit harder. The pivot is the moment of the piece — give it more weight.",
      "created_at": "2026-05-10T15:38:02.000Z"
    }
  ],
  "image": {
    "regenerate": true,
    "context": "Make sure it's actually Itauma — young black British heavyweight, not Muhammad Ali. Southpaw stance."
  }
}
```

### 4.3 Why each field exists (the link)

- `quote` — the exact selected text. The reviser searches for this verbatim in the markdown source.
- `paragraph_index` — disambiguates if the quote appears more than once in the article.
- `paragraph_text` — the entire paragraph the quote came from. Lets the reviser see local prose around the editor's note.
- `preceding_context` / `following_context` — the paragraphs immediately before and after. Lets the reviser understand rhythm and topic flow.
- `comment` — the editor's note itself.
- `image.context` — guidance fed into the image-agent's concept-extraction prompt when regeneration is requested.

### 4.4 Storage location rationale

JSON sidecars live in the **agent codebase** (`~/Desktop/ssnn-outputs/review-requests/`), not the site repo, because:
- The site repo's `.md` files stay clean (article + frontmatter only — no review metadata).
- The agent already owns pipeline state files (`articles-state.json`, `image-state.json`); review-request JSON is the same pattern.
- Site repo never commits revision metadata to git → portfolio stays presentable.

### 4.5 Archive

Every revision submit triggers archival before the new draft is written. Archive root is `~/Desktop/ssnn-outputs/review-archive/`:

```
~/Desktop/ssnn-outputs/review-archive/
  {slug}/
    {ISO-timestamp}/
      original.md            ← the .md prior to revision
      review-request.json    ← the editor's annotations + notes
```

Archives are never auto-deleted. Recovery is `cp` away.

## 5. The reviser-agent

A new TypeScript agent at `~/Desktop/ssnn-outputs/reviser-agent/`, parallel to the existing `writer-agent/`, `editor-agent/`, and `image-agent/`. Same conventions: `tsx` for direct execution, no build step, `npm start` entry point.

### 5.1 Layout

```
~/Desktop/ssnn-outputs/reviser-agent/
├── package.json
├── src/
│   ├── index.ts          # CLI entry
│   ├── prompt.ts         # builds the LLM prompt from article + review-request.json
│   ├── llm.ts            # LLM client (mirrors editor-agent's setup)
│   ├── validator.ts      # checks LLM output is sane before writing
│   └── publisher.ts      # writes revised .md back to site, updates status
```

### 5.2 CLI interface

```bash
npm start -- --slug <slug> --vertical <vertical> [--job-id <id>]
```

`--job-id` is optional. When provided, the agent writes status updates to `~/Desktop/ssnn-outputs/review-jobs/{job-id}.json` for the polling UI. When absent, the agent runs as a one-shot CLI (useful for manual debugging).

### 5.3 Execution flow

1. **Read inputs:**
   - Article: `~/Desktop/Sandbox Daily/sandbox-daily/src/content/{vertical}/{date}-{slug}.md`
   - Review request: `~/Desktop/ssnn-outputs/review-requests/{vertical}/{slug}.review-request.json`
2. **Archive originals** to `~/Desktop/ssnn-outputs/review-archive/{slug}/{ISO-timestamp}/` (both `.md` and `.json`).
3. **Strip frontmatter** from the article. The LLM sees only the body. This is the safety belt: the LLM cannot accidentally mangle frontmatter, image paths, slug, or category.
4. **Build the prompt** (Section 5.5) and call the LLM.
5. **Validate the response** (Section 5.4). Hard error on failure.
6. **Reattach the original frontmatter** with three updated fields:
   - `status: pending`
   - `revision_round: <prev + 1>`
   - `last_revised_at: <ISO timestamp>`
7. **Write the revised `.md`** back to its original location, overwriting the previous draft.
8. **If `image.regenerate === true`:** shell out to image-agent (Section 5.6).
9. **Move the consumed review-request JSON** to the archive directory.
10. **Update the job status to `done`** so the polling UI can refresh.

### 5.4 Output validation

The reviser refuses to write any output that fails any of these checks. Failures set `job.status: error`, leave the original article untouched, and do not auto-retry.

| Check | Rationale |
|---|---|
| Output is non-empty. | Catches model truncation / API errors. |
| Output starts with the same H1 heading as the original. | Catches the model dropping or rewriting the title. |
| Word count is within ±40% of the original. | Catches runaway truncation or doubling. |
| Output parses as valid markdown (no broken code fences, etc.). | Catches structural breakage. |

### 5.5 Prompt design

System prompt establishes the reviser's role:
- Revising in response to **editorial critique**, not editing for grammar or style.
- Address each inline comment **specifically** — not just generally tighten prose.
- Preserve voice, tone, structure, and any sourced facts unless the editor's notes require change.
- Acknowledge **concrete asks** (rewrite this paragraph; change this framing). Resist **vague pressure** (a comment of "this could be punchier" → small adjustment, not wholesale rewrite).

User prompt is the structured payload from Section 4.2: full article body + overall notes + each inline comment with paragraph context.

### 5.6 Image regeneration wiring

When `image.regenerate === true`, after writing the revised `.md`:

```bash
cd ~/Desktop/ssnn-outputs/image-agent && \
  npm start -- --force --file <date>-<slug>.md \
    --revision-context "<image.context>"
```

This requires a small change to image-agent: a new `--revision-context` flag that prepends the user's guidance to the concept-extraction prompt. **That image-agent change is in scope for this build** but is small (~10 lines).

Image regeneration failure does NOT roll back the article revision. The article is the primary artifact. If the image fails, the user sees the new text + old image and can request another revision with the toggle ticked again.

## 6. Async job pattern

### 6.1 New API routes

**`POST /api/review/revision`** — accepts a revision request, spawns the reviser as a detached process, returns immediately.

```ts
// Request body
{
  vertical: "sport" | "news" | "tech" | "features",
  slug: string,
  overall_notes: string,
  inline_comments: Array<{
    id, quote, paragraph_index, paragraph_text,
    preceding_context, following_context, comment, created_at
  }>,
  image: { regenerate: boolean, context: string | null }
}

// Response (immediate, ~50ms)
{ jobId: "9f3e...", status: "queued" }
```

Behavior:
1. Validate body. Same discipline as existing `/api/review` endpoint.
2. If a `running` job exists for this `{vertical, slug}` → return `409 Conflict`.
3. Write the payload to the JSON sidecar location.
4. Flip the article's frontmatter to `status: revision-requested`.
5. Write a job record with `status: queued`.
6. Spawn the reviser-agent as a detached child process:
   ```ts
   const child = spawn('npm', ['start', '--', '--slug', slug, '--vertical', vertical, '--job-id', jobId], {
     cwd: REVISER_AGENT_PATH,
     detached: true,
     stdio: ['ignore', logFd, logFd],
   });
   child.unref();
   ```
7. Return `{ jobId, status: "queued" }`.

`REVISER_AGENT_PATH` is sourced from an env var, hardcoded absolute path. Documented in `.env.local.example`.

**`GET /api/review/revision/status?id=<jobId>`** — reads the job record file, returns it as JSON.

```ts
// Response
{
  jobId: "9f3e...",
  status: "queued" | "running" | "done" | "error",
  current_step: "calling LLM",
  started_at: "...",
  updated_at: "...",
  error: null
}
```

Same dev-only `NODE_ENV` check as the existing approve/reject endpoint.

### 6.2 Job record on disk

`~/Desktop/ssnn-outputs/review-jobs/{jobId}.json`:

```json
{
  "id": "9f3e2c1a-...",
  "slug": "...",
  "vertical": "sport",
  "status": "running",
  "current_step": "calling LLM",
  "started_at": "2026-05-10T15:42:11.000Z",
  "updated_at": "2026-05-10T15:42:13.000Z",
  "error": null,
  "log_path": "/Users/sandboxsansan/Desktop/ssnn-outputs/review-jobs/9f3e2c1a-....log"
}
```

The reviser-agent writes to this file at every major step: `starting → reading inputs → calling LLM → validating → writing → triggering image regen → done`.

### 6.3 UI polling

After submit, UI polls `GET /api/review/revision/status?id=<jobId>` every 2 seconds. Each tick renders `current_step` as humanised text. Polling auto-stops on:
- `status: done` → toast + reload review page.
- `status: error` → show error + Retry button.
- 5-minute wall-clock timeout → show "Job appears stuck — check logs at `<log_path>`" + Retry.

### 6.4 Concurrency

| Scenario | Behavior |
|---|---|
| Two clicks on same article | Second is rejected with `409 Conflict`. UI shows "already in revision". |
| Different articles, same time | Both proceed. Each spawns its own reviser process. No shared state. |
| Reviser crashes silently | Status stays at last update for 5 min. UI shows stuck-job banner with Retry. |

### 6.5 Cleanup

No auto-cleanup of job records or archived drafts in MVP. Disk impact is negligible (~2KB per job + small log files). Manual cleanup: `rm -rf ~/Desktop/ssnn-outputs/review-jobs/*`. Revisit if it ever grows to thousands of files.

## 7. Error handling

User-facing behavior for each failure mode:

| Failure | What the user sees | What persists |
|---|---|---|
| Model returns invalid output | "Revision failed validation — original draft kept. Click Retry." | Original draft untouched. Annotations stay loaded. |
| Model times out (> 5 min) | Timeout banner + Retry button. | Original draft untouched. Annotations stay loaded. |
| Image regeneration fails | Small banner: "Image regeneration failed — see logs." Article revision still succeeds. | New text, old image. User can request another revision with image toggle ticked. |
| User closes tab mid-redraft | Agent keeps running. New draft appears in `pending` when complete. | All work preserved. |
| API endpoint hit in production | `403 Forbidden`. | n/a — endpoint disabled by `NODE_ENV` check. |
| Double-click on Send to reviser | First creates the job; second gets `409 Conflict`. UI shows "already in revision". | First submission succeeds normally. |

## 8. Testing approach

### Automated
- **Reviser-agent validator** (`src/validator.ts`): unit tests covering each rejection rule (empty output, missing H1, word-count drift, malformed markdown).
- **API route input validation** (`/api/review/revision`): tests covering body schema, dev-only `NODE_ENV` gate, `409 Conflict` on duplicate jobs.
- **Job record reads** (`/api/review/revision/status`): tests for missing job ID, malformed status file, terminal-state behavior.

### Manual
- The full annotation UI (text selection, popover, anchored highlights, sidebar sync, scroll-to-highlight, hover tooltips). Automated UI tests for selection-based interactions are not worth the time at MVP scale.
- End-to-end revision flow on at least one of the two real articles flagged 2026-05-10 (the Itauma piece, which already needs work).

## 9. Open risks

- **Selection anchoring on rerender.** If the article body somehow rerenders mid-annotation (shouldn't happen with `force-dynamic`, but worth being defensive), we'd need to re-resolve highlights from `paragraph_index + quote`. Plan: render markers from state, never from DOM.
- **LLM context length.** Some articles plus accumulated annotations may push the prompt large. The current articles are 1,000–1,300 words — well within Claude's window. Worth re-checking once articles routinely exceed ~5,000 words.
- **First-revision UX clarity.** "Round 1" badge in the queue: is it self-explanatory or do we need a tooltip? Defer until a real article hits round 2 and we can see how it feels.
- **image-agent dependency.** Section 5.6 requires a `--revision-context` flag on the image-agent. That change is in-scope for this build but lives in a different codebase (`~/Desktop/ssnn-outputs/image-agent/`). The implementation plan must include it as a step rather than assume it exists.

## 10. Out of scope (deferred polish)

These are deliberately not in MVP. Each is a follow-up if/when needed:
- Auto-saving in-progress annotations.
- Keyboard shortcuts.
- Side-by-side / diff view between rounds.
- Notifications outside the active tab.
- Round caps and warnings.
- Auto-cleanup of old jobs / archives.
- Production access (revision endpoint stays dev-only).

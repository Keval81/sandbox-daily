# Sandbox Daily Article Pipeline Audit - 2026-05-14

Scope: `research-docs` / `research-docs-features` -> `writer-agent` -> `editor-agent` -> `image-agent` -> `reviser-agent` -> site `/review` approval, reject, and revision flows.

Repos reviewed:

- Agent pipeline: `/Users/sandboxsansan/Desktop/ssnn-outputs`
- Site: `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily`

## P0 - Broken / Data-Loss Risk

No confirmed P0 issues found during the read-only audit.

## P1 - UX / Correctness Gaps

1. Revision job failures are not visible after reload.
   - Evidence: the site persists job records under `review-jobs`, and `reviser-agent/src/job.ts` writes `status: "error"` plus `error`, but `/review/[vertical]/[slug]/page.tsx` does not read persisted jobs. `ReviewActions.tsx` only shows transient client state from the initial submit/poll.
   - Impact: a failed revision can leave the article at `status: revision-requested` with no visible next action after navigation or hard reload.
   - Suggested fix: load the latest persisted job for the article on the server page and render job status, last error, and a retry action that reuses the persisted review-request JSON.

2. Site article parsing collapses `revision-requested` into `published`.
   - Evidence: `src/lib/articles.ts` maps any status other than `pending` to `published`.
   - Impact: a revision-requested article can appear live if it is reached through normal article lookup paths, and `/review` does not list it because `getPendingArticles()` only includes `pending`.
   - Suggested fix: extend `ArticleStatus` parsing to include revision lifecycle statuses and keep normal public listings restricted to `published`.

3. Feature spotlights route to `spotlights`, but review vertical validation excludes it.
   - Evidence: `image-agent/src/publisher.ts` can publish spotlight features to `src/content/spotlights`, while site revision types, review page validation, and API validation only accept `news | sport | tech | features`.
   - Impact: spotlight articles may not enter the same review/revision path even though the image pipeline publishes them to a separate site vertical.
   - Suggested fix: decide whether spotlight review should be `features` or `spotlights`, then align publisher output, site content loading, and revision validation.

4. Revision retry protection only blocks queued/running jobs.
   - Evidence: `src/lib/revision/jobs.ts` `findActiveJobFor()` ignores errored jobs, but there is no persisted retry route yet and the page does not surface the failed job.
   - Impact: repeated manual resubmits are possible only if the user recreates the request; the original JSON remains on disk but there is no UX affordance to reuse it.
   - Suggested fix: add a constrained retry endpoint or action that loads the existing request JSON, creates a fresh job, and respawns the reviser.

5. Launchd runs can overlap after the fixed 65 second sleep.
   - Evidence: both `com.sandboxdaily.pipeline*.plist` files use `WatchPaths` plus `ThrottleInterval: 15`, while `run-pipeline.sh` sleeps 65 seconds before doing work and has no lock file.
   - Impact: multiple file drops or edits can start overlapping writer/editor/image runs that race on shared state and output folders.
   - Suggested fix: add an advisory lock around `run-pipeline.sh` before the initial sleep.

6. Reject moves the markdown before images and ignores image move failures.
   - Evidence: `src/app/api/review/route.ts` renames the article into `.review-discarded` first, then best-effort moves matching images while swallowing image rename failures.
   - Impact: a rejected article can leave orphaned images in `public/images/articles`.
   - Suggested fix: inventory expected files first and report partial cleanup when any image move fails.

## P2 - Cleanup / Refactor

1. `RevisionPanel` receives a `submitting` prop that is always `false`.
   - Evidence: `ReviewActions.tsx` renders `RevisionPanel` only in `mode === "annotating"` and passes `submitting={false}`; submit immediately switches away to `mode === "submitting"`.
   - Improvement: remove the unused loading prop and simplify disabled-state logic in one file pair, or keep it only if the drawer will remain mounted during submit.

2. `ReviewActions` callback identities cause repeated polling effects.
   - Evidence: `RevisionStatus.tsx` depends on `onDone` and `onError`; `ReviewActions.tsx` passes inline callbacks, so every parent render creates new functions.
   - Improvement: wrap callbacks in `useCallback` before passing them into `RevisionStatus`.

3. `run-pipeline.sh` documentation still describes the old manual image step.
   - Evidence: header comments say image-agent runs separately after manual curation, while the script now runs writer -> editor -> image-agent by default and comments later describe the current behavior.
   - Improvement: update the stale header comments only.

4. `image-agent/src/index.ts` log says `feature_type=normal -> 3 literal images`.
   - Evidence: normal features use `extractAbstractConcepts()` and `buildAbstractFeaturePrompt()`.
   - Improvement: change the log text to `3 abstract images`.

5. Spotlight reference fetcher uses `join(destPath, "..")` for parent directories.
   - Evidence: `spotlight-reference-fetcher/src/index.ts` `downloadImage()` calls `mkdir(join(destPath, ".."), ...)`.
   - Improvement: use `dirname(destPath)` for clarity and platform correctness.

6. Type casts trust parsed job JSON without shape validation.
   - Evidence: site `readJob()` and `findActiveJobFor()` parse JSON as `JobRecord`; reviser `writeJobUpdate()` does the same for existing records.
   - Improvement: add a tiny local guard before exposing job data to UI or merging existing timestamps.

7. Duplicate article lookup logic exists in review approval and revision APIs.
   - Evidence: both `src/app/api/review/route.ts` and `src/app/api/review/revision/route.ts` define similar `findArticleFile()` helpers.
   - Improvement: extract a shared helper after status semantics are clarified.

8. `spotlight-reference-fetcher` has no test script despite custom YAML-ish frontmatter parsing.
   - Evidence: `spotlight-reference-fetcher/package.json` only has `start`; `metadata.ts` handles nested `reference_brief` manually.
   - Improvement: add parser tests before changing spotlight routing.

## Phase 2 Candidate

Implement the persisted revision failure surface in the site repo:

- Server-load the relevant persisted job when article status is `revision-requested`.
- Show job status, current step, last error, and log path on `/review/[vertical]/[slug]`.
- Add a retry button that resubmits the existing `review-request.json` instead of building a new request flow.
- Add tests for hard-reload visibility and retry spawning.

## Phase 3 Eligible P2 Fixes

Low-risk candidates that meet the requested constraints:

- `run-pipeline.sh` stale header comment.
- `image-agent/src/index.ts` misleading normal-feature log text.
- `spotlight-reference-fetcher/src/index.ts` parent-directory clarity.

The React prop/callback cleanups are small, but they touch the same area as Phase 2 and should be handled only if they remain clearly independent after the persisted-job fix lands.

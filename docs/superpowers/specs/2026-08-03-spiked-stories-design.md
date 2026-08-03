# Spiked stories — surfacing editorial-gate rejections

**Date:** 2026-08-03
**Repos:** `sandbox-daily` (workflow board), `ssnn-outputs` (pipeline notification)

## Problem

The writer-agent's editorial gate scores every research doc on newsworthiness,
traction, complexity and uniqueness. Below an average of 6 it declines to write
and records the decision in `articles/articles-state.json`:

```json
"2026-08-03-semenyo-hails-maresca-....md": {
  "processed_at": "2026-08-03T10:12:46.421Z",
  "editorial_decision": "skip",
  "skip_reason": "Pre-season friendly quote from a sponsor event..."
}
```

Nothing surfaces that. `WORKFLOW_STAGES` has no rejected state, and the scanner
reads `articles-state.json` only to hide docs whose article completed — skip
entries carry no `article` field, so they fall through and render as "still in
research" forever. Three stories were sitting spiked and invisible when this was
written; 18 have been spiked since April.

The operator learns nothing, and there is no way to overrule the gate.

## Design

### 1. Reading the skips (`sandbox-daily`)

`readEditorialSkips(articlesRoot)` in `src/lib/workflow/state-readers.ts`,
following the existing `readJsonFile` pattern (ENOENT is silence, malformed JSON
is a warning, never a throw). Returns `Map<researchFilename, EditorialSkip>`.

It must distinguish three entry shapes in `processed`:

| Entry | Meaning | Treatment |
|---|---|---|
| `editorial_decision: "skip"` | settled editorial call | spike |
| `error` + retry count | transient failure, still retries | ignore — not an editorial decision |
| `article: "..."` | written | ignore — existing completed-research path |

### 2. Scanner (`sandbox-daily`)

Spiked docs are **removed from the RESEARCH stage** and emitted as a new
`spikes: WorkflowSpike[]` field on `WorkflowDashboardData`. Without the removal
they would be counted twice — once in the column, once in the tray.

Spikes obey the same `ACTIVE_RESEARCH_WINDOW_DAYS = 7` window as research docs,
so April's rejections don't resurface.

```ts
export interface WorkflowSpike {
  id: string;
  slug: string;
  title: string;
  vertical: WorkflowVertical;
  sourcePath: string;
  reason: string;
  skippedAt: string;
  ageLabel: string;
  forceWrite?: ForceWriteJob;   // stage 2
}
```

Only `skip_reason` is persisted — not the four scores. Cards show the reason
text alone. Persisting scores is a later, optional writer-agent change.

### 3. Tray (`sandbox-daily`)

`SpikedTray` renders above the pipeline board on `/admin/workflow`, and renders
nothing at all when there are no spikes. Chosen over a 9th board column because
the board is already 1180px and scrolls on a 390px phone, and over a badge in
the RESEARCH column because a spiked doc is terminal, not in flight.

Per row: headline, vertical chip, age, full reason, and three actions —
**Open** (research doc), **Write anyway** (stage 2), **Bin** (reuses the existing
`archiveWorkflowFile({filePath, reason})`).

Tap targets ≥44px and the layout stacks on narrow screens, per the 2026-08-02
phone fixes.

### 4. Write anyway (`sandbox-daily`, stage 2)

Server action in `src/app/admin/workflow/actions.ts`, gated by the existing
`assertLocalOnly()`. It spawns, detached:

```
run-pipeline.sh --no-wait -- --file <doc> --force
```

Going through `run-pipeline.sh` rather than the writer directly is deliberate:

- it takes the `/tmp/ssnn-pipeline.lock` singleton, so a force-write cannot run
  concurrently with the loop's writer stage and lose an `articles-state.json`
  write (the file is rewritten wholesale);
- it carries the story writer → editor → image in one run, so it reaches
  `/review` immediately instead of waiting on the loop's 180s cycle.

The filename is validated as a basename that exists in `research-docs/` — it
reaches a shell, so no paths, no traversal.

A job record (`ssnn-outputs/force-write-jobs/<slug>.json`: filename, slug,
startedAt, status, logPath) drives the row's "Writing…" state. **The lock case
matters:** a run that cannot take the lock exits 0 having done nothing, so the
wrapper records `status: "busy"` and the row offers a retry rather than
reporting a success that never happened.

Rows self-clear: on success the writer's `recordSuccess` overwrites the skip
entry, so the doc leaves the tray and appears on the board.

### 5. Phone notification (`ssnn-outputs`)

`run-pipeline.sh` gains a notification step covering **both** signals:

- **spiked:** entries whose `processed_at` is newer than this run's start
- **pending review:** the count the macOS notification already computes

Delivered to ntfy.sh (free, no account, `curl` only — no package added) with a
`Click:` header to the Tailscale `/admin/workflow` URL. The macOS notification
stays; this is additive, because the operator works from a phone and the Mac
mini's notification centre is not where they are looking.

The topic name is the only access control on a public ntfy topic, so it is long
and random, lives in a gitignored `.ntfy-topic`, and a missing file disables the
push silently rather than failing the run.

## Testing

| Unit | Covers |
|---|---|
| `state-readers` | skip vs error vs completed entries; missing file; malformed JSON warning |
| `scanner` | spikes emitted; spiked doc absent from RESEARCH; 7-day window; force-written doc leaves the tray |
| workflow actions | basename-only validation, rejects traversal, gate enforced |
| notification | `--dry-run` prints the payload instead of POSTing; no topic file = silent no-op |

## Out of scope

Persisting the four editorial scores; tuning the threshold; auto-retrying spiked
stories; any change to how the gate scores.

*Last updated: 2026-08-03*

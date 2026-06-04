# Event Radar — Design Spec

**Date:** 2026-06-04
**Slice:** 1 of 3 (Sandbox Daily finish-line scope)
**Status:** Approved for planning

## Problem

The automated breaking-news monitoring that fed Sandbox Daily's long-form
pipeline ran through OpenClaw (`ss-news-network` monitor + Telegram approvals).
It became unreliable and stopped delivering. We need to replace that automated
monitoring role with a deterministic process built on the same proven pattern
as the existing writer/editor/image agents.

OpenClaw is **not** retired entirely: it still serves the **ad-hoc** path —
when the user requests a specific article, OpenClaw drops a research doc into
`research-docs/`. The new process only replaces the broken *automated*
monitoring, and coexists in the same folder.

## Goal

A reliable loop that:
1. Surfaces ranked breaking-news events (global + London) on a web dashboard.
2. Lets the user **Promote** an event with one click.
3. Generates a research doc into `research-docs/` for the existing
   writer → editor → site pipeline — **without depending on OpenClaw**.

## Non-Goals (MVP)

- No Grok / paid social sources (GDELT-only, $0). Grok stays a future, flagged option.
- No auto-promote — a human clicks Promote. The radar surfaces; it does not decide.
- No changes to the writer/editor/image agents or the OpenClaw ad-hoc path.
- No maps/geographies/fabricated detail in any generated artifact.

## Architecture

Three components, each mirroring an existing agent pattern. All inter-process
communication is filesystem-based, matching the current pipeline.

```
GDELT ──> [event-radar agent] ──> events.json
                                      │
                          (site reads via path bridge)
                                      ▼
                          [admin/radar dashboard] ──Promote──> research-leads/
                                                                     │
                                                                     ▼
                                              [research-agent] ──> research-docs/
                                                                     │
                                          (existing) writer ──> editor ──> site
```

### 1. `event-radar/` agent

- **Location:** `~/Desktop/ssnn-outputs/event-radar/` (sibling of `writer-agent`, `image-agent`).
- **Runtime:** Node + TypeScript, run by launchd `com.sandboxdaily.event-radar`, **hourly**.
- **Source:** GDELT DOC 2.0 API (free, no key). Two queries: a global breaking-news
  feed and a London/UK-filtered feed. Each event carries coverage volume (virality
  proxy), tone (sentiment), and source article URLs.
- **Ranking:** weighted score over coverage volume + tone extremity + recency.
  Exact weights decided during implementation; tunable via a config constant.
- **Dedup + promoted status:** `event-radar/radar-state.json` is the **source of
  truth** for which event ids have been surfaced and which have been promoted.
  `events.json` is a derived view regenerated hourly — when the agent rebuilds it,
  it re-stamps `promoted: true` onto any event whose id is marked promoted in
  radar-state, so a Promote click survives the next regen. The Promote API writes
  the promoted mark to radar-state (not to events.json directly).
- **Output:** writes `event-radar/events.json` **atomically** (temp file + rename),
  top ~15 ranked events.

### 2. Admin dashboard — `src/app/admin/radar/`

- **Location:** Next.js route group, sibling of the existing `src/app/admin/workflow/`.
- **Reads** `events.json` through the existing ssnn-outputs path bridge
  (`src/lib/workflow/paths.ts`) via a server route — never bundles a path into the client.
- **UI:** ranked list of events — title, summary, sentiment, coverage volume,
  location (global/London), source links, surfaced time. Promoted events visually marked.
- **Promote:** per-event button → POST to a server API route that writes a lead
  file to `research-leads/` (atomic) and records the event id as promoted in radar-state.

### 3. `research-agent/`

- **Location:** `~/Desktop/ssnn-outputs/research-agent/` (sibling agent).
- **Runtime:** Node + TypeScript + Claude CLI, run by launchd
  `com.sandboxdaily.research-agent`, **every ~3 min** (matches the old approval-handler cadence).
- **Behavior:** scans `research-leads/` for new leads. For each:
  1. Fetches the event's source article(s) for grounding facts.
  2. Calls the Claude CLI to synthesise a research doc in the established format
     (see Data Contracts).
  3. Writes `research-docs/YYYY-MM-DD-<slug>.md` with frontmatter `source: radar`.
  4. Moves the lead to `research-leads/.processed/`.
- Failures are logged and the lead moved to `research-leads/.errors/`; the loop
  continues. Never silently swallow.

## Data Contracts

### `events.json`

```json
{
  "generated_at": "2026-06-04T14:00:00Z",
  "events": [
    {
      "id": "gdelt-<stable-hash>",
      "title": "…",
      "summary": "1-2 sentence neutral synopsis",
      "location": "global | london",
      "tone": -3.7,
      "volume": 412,
      "score": 0.81,
      "sources": ["https://…", "https://…"],
      "surfaced_at": "2026-06-04T14:00:00Z",
      "promoted": false
    }
  ]
}
```

### Lead file — `research-leads/<id>.json`

```json
{
  "event_id": "gdelt-<stable-hash>",
  "title": "…",
  "summary": "…",
  "sources": ["https://…"],
  "location": "global | london",
  "promoted_at": "2026-06-04T14:12:00Z"
}
```

### Research doc — `research-docs/YYYY-MM-DD-<slug>.md`

Matches the format the writer-agent already consumes: a title, a Source/Date/URL
metadata block, a `## Summary`, then structured fact sections (definitions,
timelines, key data, the non-obvious angle). Adds frontmatter so origin is
traceable:

```markdown
---
source: radar
event_id: gdelt-<stable-hash>
generated_at: 2026-06-04T14:13:00Z
---

# <Event headline as research title>

**Source:** <publication(s)>
**Date:** <date>
**URL:** <primary source url>

---

## Summary
…

## <fact sections>
…
```

## Coexistence with OpenClaw

- Both OpenClaw (ad-hoc) and the research-agent (radar) write into the **same**
  `research-docs/` folder. The writer-agent scans the folder indiscriminately and
  dedups via its own `articles-state.json`, so the two streams never collide as
  long as filenames are unique (date + slug guarantees this).
- No change to OpenClaw config or the ad-hoc path.

## Error Handling

- `event-radar`: GDELT fetch failure → keep the previous `events.json`, log, exit
  non-zero so launchd surfaces it. Never write a partial/empty feed over a good one.
- Promote API: validate the event exists in the current feed before writing a lead;
  return a clear error to the dashboard otherwise.
- `research-agent`: per-lead try/catch; failed leads → `.errors/` with the reason; the
  run continues with remaining leads.

## Testing

- **event-radar:** unit-test the ranking function and the GDELT-response → event
  mapping against fixture payloads. Test atomic-write (temp+rename) behavior.
- **research-agent:** unit-test lead parsing, slug/filename generation (uniqueness,
  no collisions), and the research-doc assembly given a stubbed Claude response.
- **dashboard:** the Promote route — writes a well-formed lead, rejects unknown ids.
- Follow TDD where the unit is pure (ranking, mapping, slug); integration points
  (GDELT, Claude CLI) are stubbed behind a small interface, as the existing agents do.

## Build Order (for the plan)

1. `event-radar` agent → `events.json` (verifiable in isolation: run it, inspect the file).
2. `admin/radar` dashboard reading `events.json` (read-only view).
3. Promote route → `research-leads/`.
4. `research-agent` → `research-docs/` (closes the loop to the writer).
5. launchd plists + a short README per agent (matches existing deliverable bar).

Each stage is independently verifiable, which keeps the slice finishable in steps
rather than one big-bang merge.

## Decisions Locked

- GDELT-only ($0); Grok deferred behind a future flag.
- Local = London; cadence = hourly (radar), ~3 min (research-agent).
- We own research-doc generation; OpenClaw retired from the automated loop, kept for ad-hoc.
- MVP = dashboard + one-click promote + auto research-doc generation.

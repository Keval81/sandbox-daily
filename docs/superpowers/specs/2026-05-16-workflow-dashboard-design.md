# Workflow Dashboard — Design Spec

**Status:** Approved for implementation planning
**Author:** SanSan + Codex
**Date:** 2026-05-16

---

## 1. Context

Sandbox Daily already has a filesystem-driven editorial pipeline, but there is no single place to see where each story is, what is stuck, or what manual action is needed next. The current workflow spans `ssnn-outputs` agent folders, article folders, review jobs, image output, and the Next.js site content.

This dashboard gives SanSan a production control room for the article pipeline. It starts with operational visibility and safe actions, then leaves space for separate engagement and front-facing virality work later.

## 2. Goals

- Show every active story from research doc creation through publication.
- Make bottlenecks obvious at a glance.
- Separate `Normal`, `Feature`, and `Spotlight` work without splitting the experience into three dashboards.
- Surface failed jobs, stale items, logs, and manual handoffs.
- Provide safe operational actions: open source, open review, open logs, retry failed jobs, and move eligible articles to `social-ready`.
- Live inside the existing Next.js app at `/admin/workflow`.
- Keep engagement and front-facing virality out of this first implementation.

## 3. Non-Goals

- Full pipeline orchestration from the UI.
- Direct buttons to run writer, editor, image, or reviser agents from scratch.
- Published article engagement analytics.
- Comments analytics.
- Grok/X virality or sentiment visualization.
- A permanent database-backed story model in the first version.
- Public access.

## 4. Product Shape

The dashboard is a combined control room with four surfaces on one screen:

1. **Live Pipeline Map** — stage-level counts across the full story workflow.
2. **Story Swimlanes** — horizontal lanes for `Normal`, `Feature`, and `Spotlight`.
3. **Exceptions Feed** — urgent items requiring action: failed jobs, stale queues, missing image handoffs, and review bottlenecks.
4. **Story Drill-Down Table** — filterable operational detail with file links, stage, health, and actions.

The map answers, “Where is the system blocked?” The swimlanes answer, “Which type of story is moving?” The exceptions feed answers, “What should I do next?” The table answers, “What exactly is this story and where are its files?”

## 5. Route & Access

Route: `/admin/workflow`

Access in MVP:

- Local/dev-only.
- Force dynamic rendering so filesystem state is read on every request.
- No public production exposure until authentication and environment boundaries are designed.

Future admin routes:

- `/admin/engagement` for article performance, views, shares, comments, and trends.
- Virality will be designed separately because it is front-facing as well as operational.

## 6. Pipeline Model

The MVP derives story state from the existing filesystem and state files. It does not require a new canonical database record.

Pipeline stages:

1. `Research` — story exists in `research-docs` or `research-docs-features`.
2. `Writer` — writer-agent has picked up or processed the research doc.
3. `Editor` — article is in editor processing or routed by category.
4. `Ready Image` — edited article is ready for manual image curation.
5. `Image Agent` — article is in `social-ready` or image-agent state.
6. `Human Review` — site draft exists with `status: pending`.
7. `Revision` — article is `revision-requested` or has an active/failed review job.
8. `Published` — article is live with `status: published`.

Story types:

- `Normal` from `research-docs`.
- `Feature` from `research-docs-features`.
- `Spotlight` when feature metadata, filename, or reference-fetcher data indicates a spotlight profile.

Verticals:

- `news`
- `tech`
- `sport`
- `features`
- `review` as a routing/error bucket from editor-agent
- `spotlights` only if the existing spotlight routing is kept separate; otherwise spotlight stories display as type `Spotlight` inside vertical `features`.

## 7. Data Sources

Primary roots:

- `/Users/sandboxsansan/Desktop/ssnn-outputs/research-docs`
- `/Users/sandboxsansan/Desktop/ssnn-outputs/research-docs-features`
- `/Users/sandboxsansan/Desktop/ssnn-outputs/articles`
- `/Users/sandboxsansan/Desktop/ssnn-outputs/writer-agent`
- `/Users/sandboxsansan/Desktop/ssnn-outputs/editor-agent`
- `/Users/sandboxsansan/Desktop/ssnn-outputs/image-agent`
- `/Users/sandboxsansan/Desktop/ssnn-outputs/review-jobs`
- `/Users/sandboxsansan/Desktop/ssnn-outputs/review-requests`
- `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/src/content`
- `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily/public/images/articles`

Useful state files:

- `writer-agent` state, if present.
- `editor-agent/editor-state.json`.
- `image-agent/image-state.json`.
- `articles/articles-state.json`.
- `review-jobs/*.json`.
- article frontmatter in site content.

The implementation should tolerate missing state files and infer from folder position when state is incomplete.

## 8. Story Record Shape

The dashboard should normalize each discovered story into a derived record:

```ts
type WorkflowStory = {
  id: string;
  slug: string;
  title: string;
  type: "normal" | "feature" | "spotlight";
  vertical: "news" | "tech" | "sport" | "features" | "review" | "spotlights" | "unknown";
  stage: "research" | "writer" | "editor" | "ready-image" | "image-agent" | "human-review" | "revision" | "published";
  health: "ok" | "stale" | "warning" | "error";
  ageLabel: string;
  sourcePath?: string;
  articlePath?: string;
  reviewPath?: string;
  logPath?: string;
  latestError?: string;
  availableActions: WorkflowAction[];
};

type WorkflowAction =
  | "open-source"
  | "open-review"
  | "open-logs"
  | "retry-failed-job"
  | "move-to-social-ready";
```

This is a derived view model, not a persisted database schema.

## 9. UI Design

Use the approved combined control-room layout from the visual companion.

### 9.1 Top KPI Bar

Shows:

- `Needs Attention`
- `Manual Moves`
- `In Flight`
- `Live Today`

The counts should be clickable filters when practical.

### 9.2 Live Pipeline Map

Shows the eight pipeline stages left-to-right. Each stage displays:

- count
- shortest useful detail, such as oldest item or failed job count
- severity state: neutral, warning, error, or complete

Clicking a stage filters the drill-down table and highlights matching swimlane items.

### 9.3 Story Swimlanes

Three lanes:

- `Normal`
- `Feature`
- `Spotlight`

Each lane shows compact story pills placed under their current stage. Pill color reflects health, not vertical. Clicking a pill opens the story detail drawer or filters the table to that story.

### 9.4 Exceptions Feed

Right-side panel ordered by urgency:

1. failed jobs
2. stale manual handoffs
3. stale review items
4. missing source/article/image links

Each exception includes:

- time/age
- story title
- stage
- reason
- primary safe action

### 9.5 Story Drill-Down Table

Columns:

- story
- type
- vertical
- current stage
- health
- last activity / age
- action

Filters:

- active
- errors
- manual moves
- normal
- feature
- spotlight
- published

## 10. MVP Actions

Supported in v1:

- **Open source** — opens or links to the source research/article file.
- **Open review** — links to `/review/[vertical]/[slug]` when a pending site draft exists.
- **Open logs** — opens or links to a relevant log file when present.
- **Retry failed job** — only for failed jobs where an existing safe retry endpoint or persisted request exists.
- **Move to social-ready** — moves an eligible edited article from `articles/published/{category}` to `articles/social-ready/{category}` for image generation.

Deferred:

- trigger writer-agent directly
- trigger editor-agent directly
- trigger image-agent directly except constrained retry flows
- trigger reviser-agent directly except constrained retry flows
- bulk moves
- delete or reject actions

## 11. Error Handling

- Missing folders should render a clear dashboard-level warning, not crash the page.
- Malformed JSON state files should show as warnings with the file path.
- Invalid or unknown article frontmatter should fall back to `unknown` vertical and the nearest inferred stage where possible.
- Failed retry or move actions should return human-readable errors with the expected file/action and received failure.
- Action buttons should disable while submitting and show success/failure inline.

## 12. Testing

Unit tests:

- scan research docs and feature docs into story records
- infer story type
- infer current stage from folder/state combinations
- parse image-agent and review-job error states
- classify stale/warning/error health
- build available actions safely

Integration-style tests with temp directories:

- normal story from research to published
- feature story waiting for image curation
- failed image job with log path
- revision-requested article with failed job
- move to `social-ready`

UI tests can be added after the scanner/view-model is stable.

## 13. Implementation Notes

- Build the data scanner as server-side TypeScript under `src/lib/workflow`.
- Keep filesystem reads behind a small set of helper functions so tests can use temp roots.
- Keep `/admin/workflow` as a server-rendered page with client islands only for filters/actions.
- Do not add a database in v1.
- Do not add a new dependency unless the implementation proves it needs one.
- Use existing `lucide-react` icons for action buttons if icons are needed.

## 14. Open Decisions Resolved

- Workflow dashboard is first; engagement comes later.
- Dashboard lives inside the Next.js app.
- Visual direction is the combined control room, not a brand-constrained newspaper admin page.
- Virality is front-facing and will get its own design/spec.
- MVP uses safe operational actions, not full agent orchestration.

# Workflow Dashboard V1

## Purpose

The workflow dashboard is the internal control room for Sandbox Daily production. It answers one question first: where is each active story in the pipeline, and what needs a human action?

## Data Sources

- Research docs from `ssnn-outputs/research-docs`.
- Feature and spotlight research docs from `ssnn-outputs/research-docs-features`.
- Drafted article files from `ssnn-outputs/articles/published`.
- Image-agent handoff files from `ssnn-outputs/articles/social-ready`.
- Site content from `src/content`.
- Revision job state from `ssnn-outputs/review-jobs`.
- Archived workflow files from `ssnn-outputs/archive`.

## Pipeline Stages

1. `research` — source research exists but no article has been produced yet.
2. `writer` — reserved for writer-agent state when that job state is available.
3. `editor` — reserved for editor-agent state when that job state is available.
4. `ready-image` — article exists and still needs image/social handoff.
5. `image-agent` — article has moved into the social-ready/image-agent area.
6. `human-review` — site article is pending review.
7. `revision` — story is in revision or has a revision job issue.
8. `published` — site article is live; hidden from the main active pipeline map.

## Headline Counts

- `Needs Attention` counts active stale/error stories.
- `Actionable` counts active stories with a review, retry, or social-ready action.
- `In Flight` counts active non-published stories.
- `Live Today` counts stories published on the current day.

## Supported Actions

- Open a selected story panel from any story tile or drill-down row.
- Open review pages for pending/revision stories.
- Retry failed revision jobs.
- Move ready-image articles into social-ready.
- Archive unused, duplicate, failed, or outdated workflow files with a sidecar archive record.

## Out Of Scope For V1

- Engagement analytics for published articles.
- Front-facing virality/X/Grok dashboard.
- Megamind research indexing.
- Direct orchestration of writer, editor, image, or breaking-news agents from the UI.

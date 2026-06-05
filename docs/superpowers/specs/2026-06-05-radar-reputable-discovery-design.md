# Event Radar — Reputable-Outlet Discovery Feed

**Date:** 2026-06-05
**Status:** Approved (design), pending implementation plan
**Scope:** `~/Desktop/ssnn-outputs/event-radar/` agent only. The `/admin/radar` dashboard and the downstream research/writer/editor pipeline are unchanged — they read `events.json`, whose shape does not change.

## Problem

The radar's global query is a hard-news / conflict detector:

```
(theme:PROTEST OR theme:KILL OR theme:TERROR OR theme:LEADER OR theme:MILITARY) sourcelang:eng tone<-2
```

It systematically misses major stories that aren't tagged with those five themes or aren't negative in tone — e.g. an ISS pressure leak (space/disaster), the first AI-designed vaccine (science/health, positive tone), Ukraine striking cargo ships (military, but lost under the dominant Gaza/Hezbollah cluster). The miss happens at the **query** stage: those stories are never fetched, so no amount of ranking recovers them.

## Goal

Turn the global feed into a **broad "major world news" detector** that:
1. Surfaces the biggest stories across **all topics** (world, conflict, science, tech, space, business, health), ranked by how widely reputable outlets cover them. Broad coverage naturally subsumes hard news.
2. Treats reputable sourcing as a **strong boost + soft gate, not a hard wall** — non-reputable outlets still count toward how "big" a story looks; an event needs at least one quality outlet (or very high volume) to surface.

## Why this approach (Approach B)

The existing **London** query is domain-anchored to `bbc.co.uk OR theguardian.com OR standard.co.uk` and, in the 2026-06-05 feed, it surfaced broad stories across topics (the Grok/xAI lawsuit, an NHS payout) — not just the hard-news keywords it was tuned for. This proves a **domain-anchored query naturally surfaces big stories across all topics**. Approach B widens that proven mechanism from 3 London outlets to the full reputable allowlist, globally.

Rejected alternatives:
- **A — broaden the theme list.** Smaller change, but depends on GDELT's finicky GKG theme strings (`MANMADE_DISASTER_IMPLIED`, `TAX_DISEASE`, …); odd theme-tagging could still silently miss stories. Themes are the fragile part of the current system; B sidesteps them.
- **C — hybrid two-pass** (reputable discovery + broad-theme non-reputable corroboration). Best coverage, but most complex and consumes a third ~70s GDELT call. Deferred; can be layered on later if early-signal from non-reputable sources is wanted.

## Design

### 1. Global query (the core change)

Build the global query from the existing `AUTHORITY_DOMAINS` set (`src/authority.ts`) so the allowlist is the single source of truth for "reputable":

```
(domain:reuters.com OR domain:apnews.com OR domain:bbc.co.uk OR … all entries …) sourcelang:eng
```

- **Drop** the five conflict themes and the `tone<-2` filter — all topics, any sentiment.
- **Bump `MAX_ARTICLES_PER_QUERY` 75 → 250** (GDELT's documented max). A broad multi-outlet query needs more records to see stories from across the 24h window rather than just the most recent hour.
- **Keep `sort=HybridRel`** (GDELT relevance × recency).
- The query string is **derived from `AUTHORITY_DOMAINS`**, not hand-maintained separately, so the list stays the single source of truth.

The **London** query (slot 2) is **unchanged** — dedicated local coverage.

### 2. Ranking & gate

The "big story" signal becomes *breadth of distinct reputable coverage*. Modest rebalance of `scoreEvent` in `src/rank.ts`:

| Signal | Current | New |
|--------|---------|-----|
| volume (log-scaled) | 0.50 | 0.45 |
| recency | 0.25 | 0.25 |
| authority (distinct reputable outlets) | 0.25 | 0.30 |

Weights are **tunable on live data** — the first numbers are a starting point, not final. The surface **gate is unchanged**: an event qualifies if `authoritative OR volume >= MIN_VOLUME`. This is deliberately *not* a hard wall — a genuinely huge but thinly-reputable story can still surface.

### 3. Unchanged

- Clustering (`map.ts`), events-file writer (`events-file.ts`), state/promotion (`state.ts`), the per-query resilience + 70s inter-query spacing (`index.ts`), and `events.json` shape.
- The dashboard reads the same file → **zero dashboard changes**.

## Risks & validation

- **GDELT query length:** ~24 OR'd `domain:` clauses (~500 chars). Expected fine, but confirm one HTTP 200 before committing. GDELT is rate-sensitive (~1 req/min/IP) — validate with a single careful call, not a loop.
- **Topic skew:** the first live run may over-represent whatever is voluminous (often US politics). This is ranking tuning, not a redesign — observe live, adjust weights.
- **Allowlist double duty:** `AUTHORITY_DOMAINS` now drives both discovery and ranking. Current 24 are general-news; the example stories arrive via Reuters/BBC/Guardian, already listed. Expanding to native science/space outlets (Nature, Space.com) is a future option, out of scope here.

## Testing

- Add a `config`/query-construction test asserting the global query is built from `AUTHORITY_DOMAINS` (every domain present, no theme/tone tokens, `sourcelang:eng` present).
- Update `rank.test.ts` for the rebalanced weights.
- Existing `map`, `authority`, `events-file`, `state`, `gdelt` tests must still pass.
- Manual: one live run, confirm `events.json` regenerates with a visibly broader topic mix and that a non-conflict major story appears when one is live.

## Success criteria

- A broad cross-topic set of major stories appears in `events.json`, ranked by reputable-coverage breadth.
- Hard-news stories still rank highly (broad subsumes hard news).
- No regression in feed shape, promotion, or dashboard.
- Full test suite green; `tsc --noEmit` clean.

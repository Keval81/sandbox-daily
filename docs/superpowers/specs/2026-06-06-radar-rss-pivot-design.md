# Event Radar — RSS Front-Page Pivot (design)

**Date:** 2026-06-06
**Status:** Approved, pre-implementation
**Supersedes:** the GDELT-based fetch layer (`2026-06-05-radar-reputable-discovery-design.md` and the original GDELT design)

## Problem

The radar feed does not reflect the top world stories the big agencies are
reporting. Root cause: **GDELT DOC 2.0 is a full-text search index, not a
top-headlines service.** It has no notion of editorial prominence (what's on a
front page). With a keyword-less, domain-filtered query, GDELT's relevance sort
collapses to roughly "most recent," and the result set is dominated by the
high-volume *local/regional* output of large outlets (e.g. BBC's regional
services) rather than front-page world stories. The one signal that correlates
with importance — how many outlets cover a story — is barely present because we
under-sample (250 articles, 5 domains, 1 day) and cross-outlet headlines don't
cluster.

No amount of ranking tuning on GDELT DOC fixes this; the importance signal isn't
in the data. The fix is a **source** change.

## Solution

Replace the GDELT fetch layer with the outlets' own **front-page / top-stories
and World RSS feeds**. Those feeds *are* the editorially-curated top stories, in
the outlet's own priority order. Cross-referencing several of them gives a
genuine importance signal: a story carried on multiple front pages is, by
definition, a top story.

This is a **fetch-layer swap only**. The clean seam is `RawArticle[]`. Today
GDELT produces it; after this change, RSS produces it. Everything downstream is
unchanged: `map.ts` (clustering), `rank.ts` (scoring + soft-section penalty),
`authority.ts`, `section.ts`, `events-file.ts`, `state.ts`, the `/admin/radar`
dashboard, and the Promote flow. The site reader (`src/lib/radar/events.ts`) has
its own `RadarEvent` interface and zero GDELT references, so it is untouched.
The `global` / `london` location values are preserved so the dashboard's two
sections keep working.

## Components

### `feeds.ts` (new) — feed registry
A static list of `{ url: string; location: RadarLocation }`. All feed URLs
verified live (HTTP 200) on 2026-06-06.

**Global** (top-stories + World per outlet, deduped downstream):
- BBC top stories — `https://feeds.bbci.co.uk/news/rss.xml`
- BBC World — `https://feeds.bbci.co.uk/news/world/rss.xml`
- Guardian international — `https://www.theguardian.com/international/rss`
- Guardian World — `https://www.theguardian.com/world/rss`
- NYT HomePage — `https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml`
- NYT World — `https://rss.nytimes.com/services/xml/rss/nyt/World.xml`
- Al Jazeera — `https://www.aljazeera.com/xml/rss/all.xml`
- NPR top stories — `https://feeds.npr.org/1001/rss.xml`
- NPR World — `https://feeds.npr.org/1004/rss.xml`

**London:**
- BBC London — `https://feeds.bbci.co.uk/news/england/london/rss.xml`
- Evening Standard — `https://www.standard.co.uk/rss`

Reuters and AP are excluded: no reliable free RSS.

### `rss.ts` (new) — single-feed fetch + parse
Fetches and parses one feed URL with `rss-parser`, returning `RawArticle[]`.
Field mapping:
- `title` ← item title
- `url` ← item link
- `domain` ← hostname of the link, normalized (reuse `rootDomain` logic, drop `www.`)
- `seendate` ← `item.isoDate` (fallback `pubDate`), as ISO
- `socialimage` ← `item.enclosure?.url` or a `media:thumbnail` / `media:content`
  custom field; `""` when absent
- `tone` ← `0` (RSS carries no tone; field kept for forward-compat)
- `location` ← from the feed registry entry

Each fetch has a ~10s timeout so a hung feed cannot stall the run.

### `fetch-feeds.ts` (new) — orchestration
Fetches all registry feeds **concurrently**, each wrapped in its own try/catch:
a feed that 404s, times out, or returns malformed XML is logged and skipped; the
rest proceed. Concatenates successful results into one `RawArticle[]`. Returns
`{ ok: boolean; articles: RawArticle[] }`, where `ok` (primary success) is true
when **at least one global feed** returned articles — matching the shape
`index.ts` already consumes from `fetchSafely`.

### `index.ts` (modified)
Replace the two `fetchSafely(GLOBAL_QUERY…)` / `fetchSafely(LONDON_QUERY…)`
calls + the 70s inter-query gap with a single `fetchFeeds()` call. Pass its
`{ ok, articles }` into the existing mapping/ranking/preserve-guard/write path
unchanged.

### Deletions
`gdelt.ts`, `tests/gdelt.test.ts`; GDELT config (`GLOBAL_QUERY`, `LONDON_QUERY`,
`GLOBAL_SORT`, `LONDON_SORT`, `INTER_QUERY_GAP_MS`, `MAX_ARTICLES_PER_QUERY`,
`GDELT_DOC_URL`); `DISCOVERY_DOMAINS` + `buildReputableQuery` and their
`tests/config.test.ts` cases. `AUTHORITY_DOMAINS` is retained (ranking boost).

## Data flow & ranking

Registry → `rss.ts` per feed (concurrent) → `RawArticle[]` → `map.ts` clusters →
`rank.ts` scores → soft-gate (`volume ≥ MIN_VOLUME OR authoritative`) →
preserve-guard → `events-file.ts` writes top `EVENT_CAP` (15) → dashboard.

`volume` now means **how many front-page feeds carried the story** (cluster
size). Cross-feed agreement is the bigness signal; the existing weights
(volume 0.45 / recency 0.25 / authority 0.30) already reward it. Because every
feed outlet is in `AUTHORITY_DOMAINS`, every event is `authoritative`, so the
`MIN_VOLUME` gate is effectively a no-op here — correct, since every input is a
curated top story and we want ranking (not a volume floor) to order them. Rank
weights are kept as-is; re-tune only if live data shows a problem (YAGNI).

The same cross-outlet headline-clustering limitation as before still applies,
but the input is now ~100–150 curated top-stories items instead of 250 random
ones, so even imperfect clustering yields a feed where *every* item is
editorially important. Clustering improvements remain a possible later
follow-up, not a requirement for this change.

## Error handling
- **Per-feed isolation:** one bad feed never sinks the run; it is logged and skipped.
- **Per-feed timeout:** ~10s, so a hanging feed cannot stall the run.
- **Preserve-guard (reused):** if all global feeds fail (e.g. no network),
  `shouldPreserveFeed(primaryOk=false, …)` keeps the existing `events.json`
  rather than blanking it.

## Testing (TDD)
- `rss.ts`: parse fixture RSS-2.0 and Atom strings → correct `RawArticle` fields,
  including domain-from-link and image-from-enclosure; malformed XML handled
  gracefully (skip/empty, no throw escaping the per-feed boundary).
- `feeds.ts`: registry invariants — every entry has a url and location; both
  `global` and `london` are represented.
- `fetch-feeds.ts`: with an injected fetcher — one feed throws → the others are
  still returned; all global feeds fail → `ok: false`.
- Reuse existing `feed-decision`, `rank`, `section`, `map` tests. Remove the
  GDELT and config-query tests.

## Dependency
- `rss-parser` — purpose-built RSS+Atom parser; normalizes feed-format quirks
  across the 11 feeds. (Approved.)

## Out of scope
- Schedule reliability (launchd re-firing on a sleeping laptop) — tracked
  separately.
- Cross-outlet clustering improvements — possible later follow-up.
- Any dashboard / Promote / research-agent changes — this change is contained to
  the event-radar fetch layer.

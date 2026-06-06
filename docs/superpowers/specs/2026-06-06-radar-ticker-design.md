# Live Ticker from Radar + Reliable Hourly Refresh (design)

**Date:** 2026-06-06
**Status:** Approved, pre-implementation

## Problem

The site's `BreakingTicker` (marquee on the homepage and `/news`) shows hardcoded,
stale placeholder headlines. The event-radar agent already produces a ranked feed
of real top stories (`events.json`), but nothing connects the two. Separately, the
radar's hourly refresh is broken: the launchd job has run once, failed (it was the
old GDELT code, exit 1), and has not re-fired — so even a wired ticker would show
stale data.

Goal: feed the ticker from the radar's top stories and make the radar refresh
reliably, hourly, around the clock.

## Solution

Two independent pieces joined only through `events.json` (the same seam the radar
dashboard uses):

**A. Ticker reads the radar (site repo).** A server-side helper returns the
radar's top-3 headlines; the two pages render them instead of hardcoded arrays.

**B. Radar refreshes hourly 24/7 (agent / launchd).** Fix the schedule and keep
the machine awake so `events.json` regenerates every hour.

The site is local-only (no deploy, no live URL), so there is no production data
bridge: the site and the radar share the same machine and the same file. In dev,
server components re-render per request, so each page load reflects the current
`events.json` — no client-side polling or revalidation needed.

## Part A — Ticker reads the radar

### `src/lib/radar/ticker.ts` (new)
```
getTickerHeadlines(limit = 3, read = readEvents): Promise<string[]>
```
- The `read` parameter defaults to the existing `readEvents` (`src/lib/radar/events.ts`)
  and is injectable so tests can pass a fake feed (no real file needed).
- `events.json` is already sorted by score descending (written by the agent's
  `events-file.ts`), so the helper takes the first `limit` events and returns their
  `title` strings, in order.
- **Fallback:** if the feed is empty or unreadable, returns a single neutral item
  `["SANDBOX DAILY — LIVE"]` so the marquee never renders empty or shows stale
  fabricated copy.
- Titles are returned as-is; `BreakingTicker` already uppercases via CSS
  (`uppercase tracking-mono`), so no transformation is needed here.
- `limit = 3` matches the current ticker density.

### `src/app/page.tsx` (modify)
- Remove the hardcoded `breakingHeadlines` constant.
- Make `Home` an `async` server component.
- `const breakingHeadlines = await getTickerHeadlines();` and pass to
  `<BreakingTicker headlines={breakingHeadlines} />`.
- `trendingTopics` and all other content are unchanged.

### `src/app/news/page.tsx` (modify)
- Make `NewsPage` `async`.
- Replace the inline `headlines={[ ... ]}` array with
  `headlines={await getTickerHeadlines()}`.

### `src/components/breaking-ticker.tsx`
- **Unchanged.** It already accepts `headlines: string[]` and uppercases via CSS.

### Content note
The radar's top stories are external outlet headlines (BBC/Guardian/NYT/etc.)
shown verbatim. This is acceptable for a breaking-news strip and is an explicit
product choice. Soft-section items rank low and effectively never reach the top 3.

## Part B — Reliable hourly refresh

### `com.sandboxdaily.event-radar.plist` (modify)
- Add `<key>RunAtLoad</key><true/>` so the radar runs on login/load (fresh data
  immediately on a reboot).
- Keep `<key>StartInterval</key><integer>3600</integer>` (hourly).
- Re-bootstrap cleanly (`launchctl bootout` → `bootstrap` → `kickstart -k`) so the
  timer arms and the current RSS code runs. The previous exit-1 was the deleted
  GDELT path; RSS exits 0.

### `com.sandboxdaily.keep-awake.plist` (new)
- A launchd agent running `/usr/bin/caffeinate -i -s`, with `RunAtLoad` +
  `KeepAlive` (restart if it dies), keeping the Mac awake so the hourly timer fires
  around the clock.
- **Known limit (documented, not solved):** closing a MacBook lid still triggers
  clamshell sleep unless on power and driving an external display. "24/7" holds
  with the lid open or docked.

### Verification
- `launchctl kickstart -k gui/$(id -u)/com.sandboxdaily.event-radar`, then confirm
  `runs` increments and `last exit code = 0`, and `events.json` `generated_at`
  advances.
- Confirm the keep-awake agent is loaded (`pmset -g assertions` shows a
  PreventUserIdleSystemSleep assertion).

## Testing
- **TDD `src/lib/radar/ticker.test.ts`** (run via `npm run test:lib`):
  - returns the top-N titles in score order;
  - respects `limit` (e.g. `limit = 2` returns 2);
  - returns the neutral fallback when the feed is empty.
  - Pass a fake `read` function returning a known `EventsFile` so no real file is
    needed and tests are deterministic.
- **Page changes:** verified by `next build` (compiles, pages render) and a manual
  homepage + `/news` check against a known `events.json`.
- **launchd / caffeinate:** verified manually (kick the job, confirm `runs`
  increments and exit 0; confirm the sleep assertion). Not unit-testable.

## Out of scope
- Cross-outlet clustering improvements (separate radar follow-up).
- Any production/deploy data bridge (site is local-only).
- Changes to the radar fetch/rank logic — this consumes `events.json` as-is.
- Headline rewriting/attribution beyond showing titles verbatim.

## Files touched
- New: `src/lib/radar/ticker.ts`, `src/lib/radar/ticker.test.ts`,
  `~/Library/LaunchAgents/com.sandboxdaily.keep-awake.plist`
- Modified: `src/app/page.tsx`, `src/app/news/page.tsx`,
  `~/Library/LaunchAgents/com.sandboxdaily.event-radar.plist`

# Live Ticker from Radar + Reliable Hourly Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed the site's BreakingTicker from the radar's top-3 headlines (server-side) and make the radar regenerate `events.json` hourly, 24/7.

**Architecture:** A server-side helper reads the radar's `events.json` (existing `readEvents()`), returns the top-3 titles, and the homepage + `/news` page render them instead of hardcoded arrays. Separately, the launchd job gets `RunAtLoad` and a companion keep-awake agent so the hourly timer fires around the clock. The two halves meet only at `events.json`.

**Tech Stack:** Next.js (App Router, server components), TypeScript, `node --test` via `npm run test:lib`, launchd, `caffeinate`.

**Conventions:**
- Site repo: `~/Desktop/Sandbox Daily/sandbox-daily`, branch `main`.
- Site imports use NO file extension (e.g. `from "./events"`), unlike the ssnn agent.
- Targeted test run: `node --import tsx --test src/lib/radar/ticker.test.ts`. Full lib suite: `npm run test:lib`.
- Typecheck: `npx tsc --noEmit`.
- Commit footer (every commit): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Run all `git`/`npm` commands from the site repo root unless noted. The launchd plists live in `~/Library/LaunchAgents/` (outside the repo); Task 3 also commits copies into `docs/ops/launchd/` for the record.

---

## Task 1: Ticker headline helper (`ticker.ts`)

**Files:**
- Create: `src/lib/radar/ticker.ts`
- Test: `src/lib/radar/ticker.test.ts`

Context: `src/lib/radar/events.ts` already exports `readEvents(): Promise<EventsFile>` and the `EventsFile` / `RadarEvent` interfaces. `events.json` is pre-sorted by score descending, so "top-N" is just the first N. `RadarEvent` has fields: `id, title, summary, location, tone, volume, score, sources, surfaced_at, latest_seen, promoted`.

- [ ] **Step 1: Write the failing tests** — Create `src/lib/radar/ticker.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { getTickerHeadlines } from "./ticker";
import type { EventsFile } from "./events";

function feed(titles: string[]): EventsFile {
  return {
    generated_at: "2026-06-06T14:00:00Z",
    events: titles.map((title, i) => ({
      id: `e${i}`,
      title,
      summary: title,
      location: "global" as const,
      tone: 0,
      volume: 1,
      score: 1 - i * 0.1,
      sources: [],
      surfaced_at: "2026-06-06T14:00:00Z",
      latest_seen: "2026-06-06T14:00:00Z",
      promoted: false,
    })),
  };
}

test("returns the top-3 event titles in feed order", async () => {
  const read = async () => feed(["First", "Second", "Third", "Fourth"]);
  assert.deepEqual(await getTickerHeadlines(3, read), ["First", "Second", "Third"]);
});

test("respects a custom limit", async () => {
  const read = async () => feed(["A", "B", "C"]);
  assert.deepEqual(await getTickerHeadlines(2, read), ["A", "B"]);
});

test("drops blank titles", async () => {
  const read = async () => feed(["Real", "   ", "Also real"]);
  assert.deepEqual(await getTickerHeadlines(3, read), ["Real", "Also real"]);
});

test("falls back to a neutral item when the feed is empty", async () => {
  const read = async () => feed([]);
  assert.deepEqual(await getTickerHeadlines(3, read), ["SANDBOX DAILY — LIVE"]);
});
```

- [ ] **Step 2: Run tests to verify they fail** — Run: `node --import tsx --test src/lib/radar/ticker.test.ts`
Expected: FAIL — cannot find module `./ticker`.

- [ ] **Step 3: Create `src/lib/radar/ticker.ts`:**
```typescript
import { readEvents, type EventsFile } from "./events";

const FALLBACK = "SANDBOX DAILY — LIVE";

/** Top-N radar headlines for the breaking ticker. `read` is injectable for tests.
 *  Falls back to a single neutral item when the feed is empty or unreadable, so
 *  the marquee never renders empty or shows stale fabricated copy. */
export async function getTickerHeadlines(
  limit = 3,
  read: () => Promise<EventsFile> = readEvents
): Promise<string[]> {
  const { events } = await read();
  const titles = events
    .slice(0, limit)
    .map((e) => e.title.trim())
    .filter((t) => t !== "");
  return titles.length > 0 ? titles : [FALLBACK];
}
```

- [ ] **Step 4: Run tests to verify they pass** — Run: `node --import tsx --test src/lib/radar/ticker.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + full lib suite** — Run: `npx tsc --noEmit && npm run test:lib`
Expected: tsc clean; all lib tests pass (existing + 4 new).

- [ ] **Step 6: Commit:**
```bash
cd ~/"Desktop/Sandbox Daily/sandbox-daily" && git add src/lib/radar/ticker.ts src/lib/radar/ticker.test.ts && git commit -m "feat(radar): top-N ticker headline helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wire the ticker into the homepage and /news

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/news/page.tsx`

Context: both are server components. `page.tsx` has a module-level `breakingHeadlines` const (hardcoded) passed at `<BreakingTicker headlines={breakingHeadlines} />`. `news/page.tsx` passes an inline array. Both become `async` and call the Task 1 helper.

- [ ] **Step 1: `src/app/page.tsx` — add the import.** After the existing `import { BreakingTicker } from "@/components/breaking-ticker";` line, add:
```typescript
import { getTickerHeadlines } from "@/lib/radar/ticker";
```

- [ ] **Step 2: `src/app/page.tsx` — delete the hardcoded const.** Remove exactly:
```typescript
const breakingHeadlines = [
  "FURY CHALLENGES JOSHUA AT TOTTENHAM — JOSHUA CALLS HIM A CLOUT CHASER",
  "IRAN WALKS AWAY FROM ISLAMABAD TALKS WITH CEASEFIRE INTACT",
  "ANTHROPIC WITHHOLDS VULNERABILITY-FINDING AI MODEL FROM PUBLIC RELEASE",
];
```
(Leave the `trendingTopics` const that follows it intact.)

- [ ] **Step 3: `src/app/page.tsx` — make Home async and fetch headlines.** Change:
```typescript
export default function Home() {
  const articles = getAllArticles().slice(0, 9);
```
to:
```typescript
export default async function Home() {
  const articles = getAllArticles().slice(0, 9);
  const breakingHeadlines = await getTickerHeadlines();
```
(The existing `<BreakingTicker headlines={breakingHeadlines} />` usage now reads the local variable — no change needed there.)

- [ ] **Step 4: `src/app/news/page.tsx` — add the import.** After `import { BreakingTicker } from "@/components/breaking-ticker";`, add:
```typescript
import { getTickerHeadlines } from "@/lib/radar/ticker";
```

- [ ] **Step 5: `src/app/news/page.tsx` — make NewsPage async + fetch.** Change:
```typescript
export default function NewsPage() {
  const articles = getArticlesByVertical("news");
```
to:
```typescript
export default async function NewsPage() {
  const articles = getArticlesByVertical("news");
  const breakingHeadlines = await getTickerHeadlines();
```

- [ ] **Step 6: `src/app/news/page.tsx` — replace the inline ticker array.** Change:
```typescript
      <BreakingTicker
        headlines={[
          "IRAN WALKS AWAY FROM ISLAMABAD TALKS",
          "EU AI REGULATION FRAMEWORK ADVANCES",
          "STRAIT OF HORMUZ TRANSIT FEES PROPOSED",
        ]}
      />
```
to:
```typescript
      <BreakingTicker headlines={breakingHeadlines} />
```

- [ ] **Step 7: Typecheck** — Run: `npx tsc --noEmit`
Expected: clean (no errors). This confirms the async server components and the helper import type-check.

- [ ] **Step 8: Manual render check.** Ensure a dev server is running (`npm run dev`). Then:
```bash
curl -s http://localhost:3000/ | grep -o 'animate-marquee' | head -1
curl -s http://localhost:3000/news | grep -o 'animate-marquee' | head -1
```
Expected: each prints `animate-marquee` (the ticker rendered). For a stronger check, open both pages and confirm the ticker shows current radar headlines (compare against `events.json` top 3). If `events.json` has stale or no data, the ticker shows the latest available or the `SANDBOX DAILY — LIVE` fallback — that's expected; Task 3 makes the data fresh.

- [ ] **Step 9: Commit:**
```bash
cd ~/"Desktop/Sandbox Daily/sandbox-daily" && git add src/app/page.tsx src/app/news/page.tsx && git commit -m "feat(ticker): render radar top-3 headlines on home + news

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Reliable hourly refresh (launchd + keep-awake)

**Files:**
- Modify (system): `~/Library/LaunchAgents/com.sandboxdaily.event-radar.plist`
- Create (system): `~/Library/LaunchAgents/com.sandboxdaily.keep-awake.plist`
- Create (repo, for the record): `docs/ops/launchd/com.sandboxdaily.event-radar.plist`, `docs/ops/launchd/com.sandboxdaily.keep-awake.plist`

Context: the radar plist currently lacks `RunAtLoad` and the job has not been re-firing; the last run was the deleted GDELT code (exit 1). RSS now exits 0. Per the approved spec, keep the Mac awake so the hourly timer fires 24/7 (lid-closed clamshell sleep is a documented limitation).

- [ ] **Step 1: Overwrite the event-radar plist with `RunAtLoad` added.** Write this exact content to `~/Library/LaunchAgents/com.sandboxdaily.event-radar.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sandboxdaily.event-radar</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string><string>-lc</string>
    <string>cd "$HOME/Desktop/ssnn-outputs/event-radar" &amp;&amp; /opt/homebrew/bin/npm start</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>3600</integer>
  <key>StandardOutPath</key><string>/tmp/event-radar.log</string>
  <key>StandardErrorPath</key><string>/tmp/event-radar.err.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Create the keep-awake plist.** Write this exact content to `~/Library/LaunchAgents/com.sandboxdaily.keep-awake.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sandboxdaily.keep-awake</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string><string>-i</string><string>-s</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/keep-awake.err.log</string>
</dict>
</plist>
```

- [ ] **Step 3: Re-bootstrap both agents.** Run:
```bash
launchctl bootout gui/$(id -u)/com.sandboxdaily.event-radar 2>/dev/null
launchctl bootout gui/$(id -u)/com.sandboxdaily.keep-awake 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.sandboxdaily.event-radar.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.sandboxdaily.keep-awake.plist
launchctl kickstart -k gui/$(id -u)/com.sandboxdaily.event-radar
```
Expected: no errors. (`bootout` may print nothing or "Boot-out failed: No such process" the first time — harmless.)

- [ ] **Step 4: Verify the radar ran successfully.** Wait for the run to finish, then check:
```bash
sleep 25
launchctl print "gui/$(id -u)/com.sandboxdaily.event-radar" | grep -E "runs|last exit code"
tail -3 /tmp/event-radar.log
node -e "console.log('events.json generated_at:', require(process.env.HOME + '/Desktop/ssnn-outputs/event-radar/events.json').generated_at)"
```
Expected: `runs` ≥ 2, `last exit code = 0`, the log shows `[radar] wrote N events`, and `generated_at` is within the last minute (fresh). If `last exit code` is non-zero, read `/tmp/event-radar.err.log` and report rather than guessing.

- [ ] **Step 5: Verify keep-awake is active.** Run:
```bash
launchctl print "gui/$(id -u)/com.sandboxdaily.keep-awake" | grep -E "state|runs"
pmset -g assertions | grep -iE "PreventUserIdleSystemSleep|PreventSystemSleep"
```
Expected: keep-awake `state = running`, and `pmset` shows a sleep-prevention assertion held by `caffeinate` (value `1`).

- [ ] **Step 6: Commit copies of the plists to the repo for the record.** Run:
```bash
cd ~/"Desktop/Sandbox Daily/sandbox-daily" && mkdir -p docs/ops/launchd \
  && cp ~/Library/LaunchAgents/com.sandboxdaily.event-radar.plist docs/ops/launchd/ \
  && cp ~/Library/LaunchAgents/com.sandboxdaily.keep-awake.plist docs/ops/launchd/ \
  && git add docs/ops/launchd/ \
  && git commit -m "ops(radar): launchd RunAtLoad + keep-awake agent for 24/7 hourly refresh

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Ticker helper `getTickerHeadlines(limit=3, read=readEvents)` with top-N + blank-drop + neutral fallback → Task 1. ✓
- Both pages async + render helper output, ticker component unchanged → Task 2. ✓
- `RunAtLoad` added to event-radar plist → Task 3 Step 1. ✓
- Keep-awake agent (`caffeinate -i -s`, RunAtLoad + KeepAlive) → Task 3 Step 2. ✓
- Re-bootstrap + verify (runs increments, exit 0, generated_at fresh, sleep assertion) → Task 3 Steps 3–5. ✓
- Testing: TDD helper (top-N, limit, fallback, blank-drop), page render check, manual launchd verify → Tasks 1–3. ✓
- Out of scope (clustering, prod bridge, fetch/rank changes, headline rewriting) → not touched. ✓
- Local-only / no client polling (server components re-read per request) → Task 2 relies on this; no revalidate added. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete content. The blank-title drop test is an addition beyond the spec's three listed cases but is consistent with the helper's `.filter` and harmless. ✓

**Type consistency:** `getTickerHeadlines(limit, read)` signature identical across Task 1 (definition) and Task 2 (called with no args → defaults 3 + `readEvents`). The test `feed()` factory matches the site `RadarEvent` shape in `events.ts` (`id,title,summary,location,tone,volume,score,sources,surfaced_at,latest_seen,promoted`) — no `authoritative/authority_sources/soft`, which the site interface omits. `EventsFile` imported as a type from `./events`. ✓

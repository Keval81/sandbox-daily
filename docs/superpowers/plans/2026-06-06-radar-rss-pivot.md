# Event Radar RSS Pivot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace event-radar's GDELT fetch layer with outlets' front-page/World RSS feeds so the feed reflects the top stories the big agencies are actually leading with.

**Architecture:** Fetch-layer swap only. New modules `feeds.ts` (registry), `rss.ts` (fetch+parse one feed → `RawArticle[]`), `fetch-feeds.ts` (concurrent orchestration, per-feed isolation). `index.ts` calls `fetchFeeds()` instead of two GDELT queries. Everything downstream — `map.ts`, `rank.ts`, `authority.ts`, `section.ts`, `events-file.ts`, `state.ts`, dashboard, Promote — is unchanged. The clean seam is `RawArticle[]`. GDELT code is deleted.

**Tech Stack:** TypeScript (ESM, `type: module`), tsx, `node --test`, `rss-parser`. Repo: `~/Desktop/ssnn-outputs/event-radar`, branch `feat/pipeline-cleanup-2026-05-14`.

**Conventions:**
- Test command (single file): `node --import tsx --test tests/<file>.test.ts`
- Full suite: `npm test` (= `node --import tsx --test tests/*.test.ts`)
- Typecheck: `npx tsc --noEmit`
- This repo does **not** track `package-lock.json` (it is untracked by convention) — do not `git add` it.
- All `git` commands run from the repo root `~/Desktop/ssnn-outputs/event-radar`. The git root is the `ssnn-outputs` parent, so stage files with their `event-radar/...` prefix is NOT needed when cwd is inside the repo — use paths relative to cwd as shown.
- Commit message footer (every commit): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 1: Add the `rss-parser` dependency

**Files:**
- Modify: `package.json` (dependencies)

- [ ] **Step 1: Install rss-parser**

Run:
```bash
cd ~/Desktop/ssnn-outputs/event-radar && npm install rss-parser
```
Expected: `package.json` gains a `dependencies` block with `rss-parser`, and `node_modules/rss-parser` exists.

- [ ] **Step 2: Verify the default import compiles under ESM**

Create a throwaway check (do NOT commit this file):
```bash
cat > /tmp/rss-import-check.ts <<'EOF'
import Parser from "rss-parser";
const p = new Parser();
void p;
EOF
cd ~/Desktop/ssnn-outputs/event-radar && npx tsc --noEmit /tmp/rss-import-check.ts && echo "IMPORT OK" && rm -f /tmp/rss-import-check.ts
```
Expected: `IMPORT OK`. (esModuleInterop is already true, so the default import resolves.)

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/ssnn-outputs/event-radar && git add package.json && git commit -m "build(radar): add rss-parser dependency

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Feed registry (`feeds.ts`) + `FEED_TIMEOUT_MS` config

**Files:**
- Create: `src/feeds.ts`
- Modify: `src/config.ts` (add one constant — additive, safe)
- Test: `tests/feeds.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/feeds.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEEDS } from "../src/feeds.js";

test("every feed has an https url and a valid location", () => {
  for (const f of FEEDS) {
    assert.match(f.url, /^https:\/\//, `non-https feed url: ${f.url}`);
    assert.ok(f.location === "global" || f.location === "london", `bad location: ${f.location}`);
  }
});

test("both global and london feeds are present", () => {
  assert.ok(FEEDS.some((f) => f.location === "global"), "no global feeds");
  assert.ok(FEEDS.some((f) => f.location === "london"), "no london feeds");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/feeds.test.ts`
Expected: FAIL — cannot find module `../src/feeds.js`.

- [ ] **Step 3: Create `src/feeds.ts`**

```typescript
import type { RadarLocation } from "./types.js";

export interface FeedSource {
  url: string;
  location: RadarLocation;
}

// Outlets' own top-stories + World RSS feeds. These are the editorially-curated
// front pages — what the agencies are leading with — unlike GDELT's full-text
// index. All URLs verified live (HTTP 200) on 2026-06-06.
export const FEEDS: readonly FeedSource[] = [
  // global — top-stories + World per outlet
  { url: "https://feeds.bbci.co.uk/news/rss.xml", location: "global" },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", location: "global" },
  { url: "https://www.theguardian.com/international/rss", location: "global" },
  { url: "https://www.theguardian.com/world/rss", location: "global" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", location: "global" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", location: "global" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", location: "global" },
  { url: "https://feeds.npr.org/1001/rss.xml", location: "global" },
  { url: "https://feeds.npr.org/1004/rss.xml", location: "global" },
  // london — local UK
  { url: "https://feeds.bbci.co.uk/news/england/london/rss.xml", location: "london" },
  { url: "https://www.standard.co.uk/rss", location: "london" },
];
```

- [ ] **Step 4: Add `FEED_TIMEOUT_MS` to `src/config.ts`**

Add this line to `src/config.ts`, immediately after the `TITLE_SIMILARITY_THRESHOLD` export (leave all other lines untouched for now):
```typescript
export const FEED_TIMEOUT_MS = 10_000; // per-feed fetch timeout; a hung feed must not stall the run
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import tsx --test tests/feeds.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ssnn-outputs/event-radar && git add src/feeds.ts src/config.ts tests/feeds.test.ts && git commit -m "feat(radar): RSS feed registry + per-feed timeout config

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Single-feed fetch + parse (`rss.ts`)

**Files:**
- Create: `src/rss.ts`
- Test: `tests/rss.test.ts`

`rss.ts` exposes three things: `domainFromUrl` (hostname → root domain), `itemsToArticles` (pure mapper, unit-tested), and `parseFeed` (parses an XML string via rss-parser — exercises RSS 2.0 + Atom). The network function `fetchFeed` is thin and is covered by the orchestration tests in Task 4 via dependency injection.

- [ ] **Step 1: Write the failing tests**

Create `tests/rss.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { domainFromUrl, itemsToArticles, parseFeed } from "../src/rss.js";

const RSS_2_0 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Test World</title>
    <item>
      <title>Big global story</title>
      <link>https://www.bbc.com/news/world-12345</link>
      <pubDate>Fri, 06 Jun 2026 09:00:00 GMT</pubDate>
      <media:thumbnail url="https://ichef.bbci.co.uk/image.jpg"/>
    </item>
    <item>
      <title>Story without image</title>
      <link>https://www.bbc.com/news/world-67890</link>
      <pubDate>Fri, 06 Jun 2026 08:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Atom</title>
  <entry>
    <title>Atom headline</title>
    <link href="https://www.theguardian.com/world/2026/jun/06/atom-story"/>
    <updated>2026-06-06T07:30:00Z</updated>
  </entry>
</feed>`;

test("domainFromUrl strips www and lowercases", () => {
  assert.equal(domainFromUrl("https://www.BBC.com/news/x"), "bbc.com");
  assert.equal(domainFromUrl("https://www.theguardian.com/world/y"), "theguardian.com");
});

test("domainFromUrl returns empty string on a malformed url", () => {
  assert.equal(domainFromUrl("not a url"), "");
});

test("itemsToArticles drops items missing a link or title", () => {
  const out = itemsToArticles(
    [
      { title: "ok", link: "https://www.bbc.com/news/a" },
      { title: "no link" },
      { link: "https://www.bbc.com/news/b" },
    ],
    "global"
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]?.url, "https://www.bbc.com/news/a");
});

test("parseFeed maps RSS 2.0 items to RawArticles with domain, date, and image", async () => {
  const arts = await parseFeed(RSS_2_0, "global");
  assert.equal(arts.length, 2);
  const first = arts[0];
  assert.equal(first?.title, "Big global story");
  assert.equal(first?.url, "https://www.bbc.com/news/world-12345");
  assert.equal(first?.domain, "bbc.com");
  assert.equal(first?.location, "global");
  assert.equal(first?.tone, 0);
  assert.equal(first?.socialimage, "https://ichef.bbci.co.uk/image.jpg");
  assert.ok(first?.seendate && !Number.isNaN(Date.parse(first.seendate)), "seendate must be a parseable date");
  assert.equal(arts[1]?.socialimage, "", "missing image maps to empty string");
});

test("parseFeed handles Atom feeds (entry/link href/updated)", async () => {
  const arts = await parseFeed(ATOM, "global");
  assert.equal(arts.length, 1);
  assert.equal(arts[0]?.title, "Atom headline");
  assert.equal(arts[0]?.url, "https://www.theguardian.com/world/2026/jun/06/atom-story");
  assert.equal(arts[0]?.domain, "theguardian.com");
  assert.ok(arts[0]?.seendate && !Number.isNaN(Date.parse(arts[0].seendate)));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/rss.test.ts`
Expected: FAIL — cannot find module `../src/rss.js`.

- [ ] **Step 3: Create `src/rss.ts`**

```typescript
import Parser from "rss-parser";
import type { RawArticle, RadarLocation } from "./types.js";
import { FEED_TIMEOUT_MS } from "./config.js";

/** The subset of an rss-parser item we consume. rss-parser normalizes both
 *  RSS 2.0 and Atom into this shape (Atom `<link href>` -> link, `<updated>` ->
 *  isoDate). Media fields come from customFields below. */
interface RssItem {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  enclosure?: { url?: string };
  mediaThumbnail?: Array<{ $?: { url?: string } }>;
  mediaContent?: Array<{ $?: { url?: string } }>;
}

const parser: Parser<unknown, RssItem> = new Parser<unknown, RssItem>({
  timeout: FEED_TIMEOUT_MS,
  customFields: {
    item: [
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["media:content", "mediaContent", { keepArray: true }],
    ],
  },
});

/** Hostname of a URL, lowercased with a leading `www.` removed. Empty on bad input. */
export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function imageFrom(item: RssItem): string {
  return (
    item.enclosure?.url ??
    item.mediaThumbnail?.[0]?.$?.url ??
    item.mediaContent?.[0]?.$?.url ??
    ""
  );
}

/** Map rss-parser items to RawArticles, dropping any without a link or title. */
export function itemsToArticles(items: RssItem[], location: RadarLocation): RawArticle[] {
  return items
    .filter((it): it is RssItem & { link: string; title: string } => Boolean(it.link && it.title))
    .map((it) => ({
      url: it.link,
      title: it.title,
      domain: domainFromUrl(it.link),
      seendate: it.isoDate ?? it.pubDate ?? "",
      tone: 0,
      location,
      socialimage: imageFrom(it),
    }));
}

/** Parse a feed XML string into RawArticles (RSS 2.0 or Atom). */
export async function parseFeed(xml: string, location: RadarLocation): Promise<RawArticle[]> {
  const feed = await parser.parseString(xml);
  return itemsToArticles(feed.items, location);
}

/** Fetch and parse a live feed URL into RawArticles. */
export async function fetchFeed(url: string, location: RadarLocation): Promise<RawArticle[]> {
  const feed = await parser.parseURL(url);
  return itemsToArticles(feed.items, location);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test tests/rss.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npx tsc --noEmit`
Expected: no output (clean). If `feed.items` typing complains, the generic `Parser<unknown, RssItem>` makes `feed.items: RssItem[]` — confirm the generic args are present.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ssnn-outputs/event-radar && git add src/rss.ts tests/rss.test.ts && git commit -m "feat(radar): RSS feed parser (RSS 2.0 + Atom) -> RawArticle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Concurrent orchestration (`fetch-feeds.ts`)

**Files:**
- Create: `src/fetch-feeds.ts`
- Test: `tests/fetch-feeds.test.ts`

Fetches every registry feed concurrently, isolates per-feed failures, and reports `ok` = "at least one global feed returned articles" (the primary-success signal `index.ts`'s preserve-guard needs).

- [ ] **Step 1: Write the failing tests**

Create `tests/fetch-feeds.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchFeeds } from "../src/fetch-feeds.js";
import type { RawArticle, RadarLocation } from "../src/types.js";

function article(domain: string, location: RadarLocation): RawArticle {
  return {
    url: `https://www.${domain}/story`,
    title: `headline from ${domain}`,
    domain,
    seendate: "2026-06-06T09:00:00Z",
    tone: 0,
    location,
    socialimage: "",
  };
}

test("a failing feed does not sink the others", async () => {
  const fetcher = async (url: string, location: RadarLocation): Promise<RawArticle[]> => {
    if (url.includes("bbc")) throw new Error("boom");
    return [article("theguardian.com", location)];
  };
  const { ok, articles } = await fetchFeeds(fetcher);
  assert.ok(articles.length > 0, "surviving feeds still contribute articles");
  assert.equal(ok, true, "a global feed succeeded");
});

test("ok is false when every global feed fails", async () => {
  const fetcher = async (url: string, location: RadarLocation): Promise<RawArticle[]> => {
    if (location === "global") throw new Error("global down");
    return [article("standard.co.uk", location)];
  };
  const { ok, articles } = await fetchFeeds(fetcher);
  assert.equal(ok, false, "no global feed returned articles");
  assert.ok(articles.some((a) => a.location === "london"), "london feeds still included");
});

test("ok is false when a global feed returns zero articles only", async () => {
  const fetcher = async (_url: string, location: RadarLocation): Promise<RawArticle[]> =>
    location === "global" ? [] : [article("standard.co.uk", location)];
  const { ok } = await fetchFeeds(fetcher);
  assert.equal(ok, false, "empty global results do not count as success");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/fetch-feeds.test.ts`
Expected: FAIL — cannot find module `../src/fetch-feeds.js`.

- [ ] **Step 3: Create `src/fetch-feeds.ts`**

```typescript
import { FEEDS } from "./feeds.js";
import { fetchFeed } from "./rss.js";
import type { RawArticle, RadarLocation } from "./types.js";

export type FeedFetcher = (url: string, location: RadarLocation) => Promise<RawArticle[]>;

/** Fetch all registry feeds concurrently. Each feed is isolated: a failure is
 *  logged and skipped so one bad feed never sinks the run. `ok` (primary
 *  success) is true when at least one GLOBAL feed returned articles — the signal
 *  the preserve-guard uses to avoid blanking the feed on a total outage. */
export async function fetchFeeds(
  fetcher: FeedFetcher = fetchFeed
): Promise<{ ok: boolean; articles: RawArticle[] }> {
  const settled = await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        return { feed, articles: await fetcher(feed.url, feed.location) };
      } catch (err) {
        console.warn(`[radar] feed failed (${feed.url}):`, err instanceof Error ? err.message : err);
        return { feed, articles: null as RawArticle[] | null };
      }
    })
  );

  const articles: RawArticle[] = [];
  let globalOk = false;
  for (const { feed, articles: arts } of settled) {
    if (!arts) continue;
    if (feed.location === "global" && arts.length > 0) globalOk = true;
    articles.push(...arts);
  }
  return { ok: globalOk, articles };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test tests/fetch-feeds.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full suite + typecheck (still green with GDELT present)**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm test && npx tsc --noEmit`
Expected: all tests pass (old GDELT tests + new RSS tests), tsc clean. The GDELT path still exists and is untouched at this point.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ssnn-outputs/event-radar && git add src/fetch-feeds.ts tests/fetch-feeds.test.ts && git commit -m "feat(radar): concurrent feed orchestration with per-feed isolation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Cut over `index.ts` to RSS and delete GDELT

This is the atomic cutover: switch `index.ts` to `fetchFeeds()`, prune GDELT config and `DISCOVERY_DOMAINS`, and delete the GDELT module + its tests. Do it all in one task so the build goes from green (GDELT) to green (RSS).

**Files:**
- Modify: `src/index.ts` (full replacement below)
- Modify: `src/config.ts` (remove GDELT exports)
- Modify: `src/authority.ts` (remove `DISCOVERY_DOMAINS`)
- Delete: `src/gdelt.ts`, `tests/gdelt.test.ts`, `tests/config.test.ts`

- [ ] **Step 1: Replace `src/index.ts` entirely**

```typescript
import { fetchFeeds } from "./fetch-feeds.js";
import { mapArticlesToEvents } from "./map.js";
import { scoreEvent } from "./rank.js";
import { shouldPreserveFeed } from "./feed-decision.js";
import { loadState, saveState, markSeen } from "./state.js";
import { writeEventsFile } from "./events-file.js";
import { EVENTS_FILE, STATE_FILE, EVENT_CAP, MIN_VOLUME } from "./config.js";

function ageHours(iso: string, now: number): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 24 : Math.max(0, (now - t) / 3_600_000);
}

async function main(): Promise<void> {
  const now = new Date();
  const nowMs = now.getTime();
  const generatedAt = now.toISOString();

  // RSS front-page feeds are the source: editorially-curated top stories.
  // Per-feed failures are isolated; `ok` is true when a global feed succeeded.
  const { ok, articles } = await fetchFeeds();

  const events = mapArticlesToEvents(articles, generatedAt).map((e) => ({
    ...e,
    score: scoreEvent({
      volume: e.volume,
      ageHours: ageHours(e.latest_seen, nowMs),
      authoritySources: e.authority_sources,
      soft: e.soft,
    }),
  }));

  const qualified = events.filter((e) => e.volume >= MIN_VOLUME || e.authoritative);

  // If every global feed failed (e.g. no network), writing would blank the feed —
  // preserve the existing events.json instead.
  if (shouldPreserveFeed(ok, qualified.length)) {
    const reason = !ok ? "all global feeds failed" : "no events cleared the quality floor";
    console.warn(`[radar] ${reason} — preserving existing feed, skipping write`);
    return;
  }

  const state = await loadState(STATE_FILE);
  for (const e of qualified) markSeen(state, e.id, generatedAt);

  await writeEventsFile(EVENTS_FILE, qualified, {
    promotedIds: state.promoted,
    cap: EVENT_CAP,
    generatedAt,
  });
  await saveState(STATE_FILE, state);

  console.log(`[radar] wrote ${Math.min(qualified.length, EVENT_CAP)} events → ${EVENTS_FILE}`);
}

main().catch((err) => {
  console.error("[radar] fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Replace `src/config.ts` entirely (drop all GDELT exports)**

```typescript
import { join } from "node:path";

const HOME = process.env.HOME;
if (!HOME) throw new Error("HOME not set");

export const RADAR_DIR = join(HOME, "Desktop/ssnn-outputs/event-radar");
export const EVENTS_FILE = join(RADAR_DIR, "events.json");
export const STATE_FILE = join(RADAR_DIR, "radar-state.json");

export const EVENT_CAP = 15;
export const MIN_VOLUME = 2; // events below this are dropped unless carried by an authoritative outlet
export const TITLE_SIMILARITY_THRESHOLD = 0.5; // overlap-coefficient cutoff for merging headlines
export const FEED_TIMEOUT_MS = 10_000; // per-feed fetch timeout; a hung feed must not stall the run
```

- [ ] **Step 3: Remove `DISCOVERY_DOMAINS` from `src/authority.ts`**

Delete the `DISCOVERY_DOMAINS` export and its leading comment block (the `// The subset used to BUILD the GDELT fetch query...` comment through the closing `];`). Leave `AUTHORITY_DOMAINS`, `rootDomain`, `isAuthoritative`, and `authoritySourceCount` exactly as they are. After the edit, the file's first export is `AUTHORITY_DOMAINS` and there are no other changes.

- [ ] **Step 4: Delete the GDELT module and its dead tests**

```bash
cd ~/Desktop/ssnn-outputs/event-radar && git rm src/gdelt.ts tests/gdelt.test.ts tests/config.test.ts
```
(Reason: `tests/config.test.ts` only tested `buildReputableQuery`, `GLOBAL_QUERY`, and `DISCOVERY_DOMAINS`, all now deleted.)

- [ ] **Step 5: Verify no stragglers still import deleted symbols**

Run:
```bash
cd ~/Desktop/ssnn-outputs/event-radar && grep -rEn "gdelt|GLOBAL_QUERY|LONDON_QUERY|GLOBAL_SORT|LONDON_SORT|INTER_QUERY_GAP_MS|MAX_ARTICLES_PER_QUERY|GDELT_DOC_URL|DISCOVERY_DOMAINS|buildReputableQuery|fetchArticles" src tests
```
Expected: **no output**. Any hit is a straggler reference to delete or rewrite before proceeding.

- [ ] **Step 6: Full suite + typecheck**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm test && npx tsc --noEmit`
Expected: all remaining tests pass (rss, feeds, fetch-feeds, rank, section, map, feed-decision, events-file, state), tsc clean. No GDELT tests remain.

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/ssnn-outputs/event-radar && git add -A && git commit -m "feat(radar): cut over fetch layer from GDELT to RSS feeds

index.ts now pulls front-page/World RSS via fetchFeeds(); GDELT module,
query config, and DISCOVERY_DOMAINS removed. Downstream map/rank/dashboard
unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Live verification

Confirm the real feed now reflects top stories and the cross-feed bigness ranking works. No code change — this validates the build end-to-end.

- [ ] **Step 1: Run the agent live**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm start`
Expected: log line `[radar] wrote N events → .../events.json` with N between 1 and 15. Per-feed warnings for any feed that times out are acceptable as long as the write happens.

- [ ] **Step 2: Inspect the feed for quality**

Run:
```bash
cd ~/Desktop/ssnn-outputs/event-radar && node -e "
const e=require('./events.json');
console.log('generated_at:', e.generated_at, '| count:', e.events.length);
e.events.forEach(ev=>console.log((ev.score||0).toFixed(3),'| a'+ev.authority_sources,'| vol'+ev.volume,'|',ev.location,'|',ev.title.slice(0,80)));
"
```
Expected (qualitative): the list reads like genuine top stories from BBC/Guardian/NYT/Al Jazeera/NPR, NOT regional/lifestyle filler. Multi-outlet stories (higher `authority_sources` / `vol`) should sit near the top. A London/UK item or two may appear (location `london`).

- [ ] **Step 3: Confirm the dashboard renders it**

If the dev server is running (`npm run dev` in `~/Desktop/Sandbox Daily/sandbox-daily`):
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/radar`
Expected: `200`. Open it and confirm events show with working Promote buttons.

- [ ] **Step 4: Update the progress memory note**

Update `~/.claude/projects/-Users-sandboxsansan-Desktop-Sandbox-Daily-sandbox-daily/memory/event-radar-slice1-progress.md`: record that the fetch layer is now RSS (feeds in `feeds.ts`), GDELT is removed, and note the live result quality. (No commit — memory is outside the repo.)

---

## Self-Review

**Spec coverage:**
- RSS source replacing GDELT → Tasks 2–5. ✓
- `feeds.ts` registry (verified URLs, global + london) → Task 2. ✓
- `rss.ts` field mapping (title/link/domain/isoDate/image/tone/location) → Task 3. ✓
- `fetch-feeds.ts` concurrent + per-feed isolation + `ok` = a global feed succeeded → Task 4. ✓
- `index.ts` swap, preserve-guard reuse → Task 5. ✓
- Deletions (gdelt.ts, gdelt/config tests, GDELT config, DISCOVERY_DOMAINS) → Task 5. ✓
- `rss-parser` dependency → Task 1. ✓
- Per-feed ~10s timeout → `FEED_TIMEOUT_MS` (Task 2) wired into the parser (Task 3). ✓
- Downstream unchanged (map/rank/section/authority/events-file/dashboard) → no tasks touch them; Task 5 Step 5 grep guards against straggler coupling. ✓
- Testing (RSS 2.0 + Atom fixtures, registry invariants, orchestration injection) → Tasks 2–4. ✓
- Out of scope (schedule, clustering, dashboard) → not addressed, correct. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step has complete code. ✓

**Type consistency:** `FeedSource{url,location}` (Task 2) used in Tasks 3–4; `FeedFetcher = (url, location) => Promise<RawArticle[]>` matches `fetchFeed`'s signature (Task 3) and the injected fetchers in tests (Task 4); `fetchFeeds()` returns `{ok, articles}` consumed by `index.ts` (Task 5) and asserted in tests (Task 4); `RawArticle` fields match `src/types.ts`; `scoreEvent({volume,ageHours,authoritySources,soft})` matches the current `rank.ts` signature; `RadarEvent.soft`/`.authority_sources`/`.authoritative` already exist. ✓

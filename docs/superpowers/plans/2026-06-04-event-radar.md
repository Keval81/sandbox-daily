# Event Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace OpenClaw's broken automated news monitoring with a deterministic loop: a GDELT-fed radar agent surfaces ranked breaking-news events → an admin dashboard lets the user Promote one → a research-agent writes a research doc into the existing pipeline.

**Architecture:** Two standalone Node/TypeScript agents under `~/Desktop/ssnn-outputs/` (mirroring `image-agent`), communicating by filesystem, plus a Next.js admin page in the `sandbox-daily` site. `event-radar` writes `events.json`; the dashboard reads it via the existing ssnn-outputs path bridge and writes promote-leads; `research-agent` consumes leads and emits research docs. OpenClaw is untouched (ad-hoc path) and coexists in the same `research-docs/` folder.

**Tech Stack:** Node 22 + TypeScript (ESM), `tsx`, `node --test` (matches `image-agent`); GDELT DOC 2.0 API (free, no key); Claude CLI for doc synthesis; Next.js (project-pinned version — see AGENTS.md); launchd for scheduling.

**Spec:** `docs/superpowers/specs/2026-06-04-event-radar-design.md`

---

## File Structure

**`~/Desktop/ssnn-outputs/event-radar/`** (new agent)
- `package.json`, `tsconfig.json` — copied from `image-agent`, renamed.
- `src/config.ts` — paths, cadence constants, ranking weights, event cap.
- `src/types.ts` — `RadarEvent`, `EventsFile`, `RadarState`.
- `src/gdelt.ts` — GDELT client: fetch raw + normalize to `RawArticle[]`.
- `src/map.ts` — `RawArticle[]` → `RadarEvent[]` (grouping, dedup-id).
- `src/rank.ts` — pure ranking score.
- `src/state.ts` — load/save `radar-state.json`; promoted-id source of truth.
- `src/events-file.ts` — atomic write of `events.json`, re-stamping promoted.
- `src/index.ts` — orchestrator.
- `tests/*.test.ts` — map, rank, state, events-file.
- `README.md`, launchd plist.

**`~/Desktop/ssnn-outputs/research-agent/`** (new agent)
- `package.json`, `tsconfig.json` — copied from `image-agent`.
- `src/config.ts`, `src/types.ts` (`Lead`).
- `src/leads.ts` — scan/parse/move leads.
- `src/slug.ts` — slug + unique dated filename.
- `src/research-doc.ts` — assemble research-doc markdown from a `DocInputs`.
- `src/claude.ts` — Claude CLI wrapper (synthesise sections from sources).
- `src/sources.ts` — fetch source article text.
- `src/index.ts` — orchestrator.
- `tests/*.test.ts` — leads, slug, research-doc.
- `README.md`, launchd plist.

**`sandbox-daily/`** (site)
- `src/lib/radar/paths.ts` — locate `events.json` / `research-leads/` (reuse `src/lib/workflow/paths.ts` pattern).
- `src/lib/radar/events.ts` — server-only read of `events.json`.
- `src/app/admin/radar/page.tsx` — dashboard page (sibling of `admin/workflow/`).
- `src/app/admin/radar/promote/route.ts` — POST promote handler.
- `src/app/admin/radar/RadarList.tsx` — client list + Promote buttons.

---

## STAGE A — `event-radar` agent

### Task 1: Scaffold the event-radar package

**Files:**
- Create: `~/Desktop/ssnn-outputs/event-radar/package.json`
- Create: `~/Desktop/ssnn-outputs/event-radar/tsconfig.json`
- Create: `~/Desktop/ssnn-outputs/event-radar/src/.gitkeep`

- [ ] **Step 1: Copy structure from image-agent**

```bash
cd ~/Desktop/ssnn-outputs
mkdir -p event-radar/src event-radar/tests
cp image-agent/tsconfig.json event-radar/tsconfig.json
```

- [ ] **Step 2: Write `event-radar/package.json`**

```json
{
  "name": "ssnn-event-radar",
  "version": "0.1.0",
  "description": "Surfaces ranked breaking-news events from GDELT into events.json",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "node --import tsx --test tests/*.test.ts"
  },
  "dependencies": {},
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 3: Install + verify toolchain**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm install && npx tsc --noEmit`
Expected: installs clean; tsc exits 0 (no source yet).

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/ssnn-outputs && git add event-radar/package.json event-radar/tsconfig.json && git commit -m "feat(event-radar): scaffold package"
```

---

### Task 2: Types

**Files:**
- Create: `~/Desktop/ssnn-outputs/event-radar/src/types.ts`

- [ ] **Step 1: Write the types**

```typescript
export type RadarLocation = "global" | "london";

/** Normalized GDELT article, decoupled from GDELT's raw field names. */
export interface RawArticle {
  url: string;
  title: string;
  domain: string;
  seendate: string; // ISO
  tone: number; // GDELT tone (negative = negative sentiment)
  location: RadarLocation;
}

export interface RadarEvent {
  id: string; // stable hash of the canonical title
  title: string;
  summary: string;
  location: RadarLocation;
  tone: number;
  volume: number; // count of articles backing this event (virality proxy)
  score: number; // ranking score 0..1
  sources: string[];
  surfaced_at: string; // when the radar first wrote this event into the feed
  latest_seen: string; // ISO of the freshest backing article (drives recency rank)
  promoted: boolean;
}

export interface EventsFile {
  generated_at: string;
  events: RadarEvent[];
}

export interface RadarState {
  /** event id -> first time we surfaced it */
  seen: Record<string, string>;
  /** event ids the user has promoted (source of truth) */
  promoted: string[];
}
```

- [ ] **Step 2: tsc**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/ssnn-outputs && git add event-radar/src/types.ts && git commit -m "feat(event-radar): types"
```

---

### Task 3: Ranking function (TDD)

**Files:**
- Create: `~/Desktop/ssnn-outputs/event-radar/src/rank.ts`
- Test: `~/Desktop/ssnn-outputs/event-radar/tests/rank.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreEvent } from "../src/rank.js";

const base = { volume: 10, tone: 0, ageHours: 1 };

test("scoreEvent returns a value between 0 and 1", () => {
  const s = scoreEvent(base);
  assert.ok(s >= 0 && s <= 1, `expected 0..1, got ${s}`);
});

test("higher coverage volume scores higher, all else equal", () => {
  assert.ok(scoreEvent({ ...base, volume: 200 }) > scoreEvent({ ...base, volume: 5 }));
});

test("more extreme tone (either direction) scores higher than neutral", () => {
  const neutral = scoreEvent({ ...base, tone: 0 });
  assert.ok(scoreEvent({ ...base, tone: -8 }) > neutral);
  assert.ok(scoreEvent({ ...base, tone: 8 }) > neutral);
});

test("older events score lower than fresh ones", () => {
  assert.ok(scoreEvent({ ...base, ageHours: 0.5 }) > scoreEvent({ ...base, ageHours: 24 }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm test`
Expected: FAIL — "Cannot find module '../src/rank.js'".

- [ ] **Step 3: Implement `rank.ts`**

```typescript
// Ranking blends three normalized signals. Weights are tunable here.
const W_VOLUME = 0.5;
const W_TONE = 0.3;
const W_RECENCY = 0.2;

export interface RankInputs {
  volume: number;
  tone: number;
  ageHours: number;
}

export function scoreEvent({ volume, tone, ageHours }: RankInputs): number {
  // Volume: log-scaled so a few mega-stories don't dominate; ~saturates by 500.
  const vol = Math.min(1, Math.log10(volume + 1) / Math.log10(500));
  // Tone: extremity in either direction, GDELT tone roughly -10..+10.
  const ext = Math.min(1, Math.abs(tone) / 10);
  // Recency: linear decay over 24h.
  const rec = Math.max(0, 1 - ageHours / 24);
  return Number((W_VOLUME * vol + W_TONE * ext + W_RECENCY * rec).toFixed(4));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm test`
Expected: PASS (4 rank tests).

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ssnn-outputs && git add event-radar/src/rank.ts event-radar/tests/rank.test.ts && git commit -m "feat(event-radar): ranking function"
```

---

### Task 4: Map articles → events (TDD)

**Files:**
- Create: `~/Desktop/ssnn-outputs/event-radar/src/map.ts`
- Test: `~/Desktop/ssnn-outputs/event-radar/tests/map.test.ts`

Groups articles by normalized title, producing one `RadarEvent` per cluster.
Volume = cluster size; tone = mean; sources = unique urls; id = stable hash.

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapArticlesToEvents } from "../src/map.js";
import type { RawArticle } from "../src/types.js";

const now = "2026-06-04T14:00:00Z";

function art(over: Partial<RawArticle>): RawArticle {
  return {
    url: "https://a.com/1",
    title: "Big Thing Happens",
    domain: "a.com",
    seendate: now,
    tone: -2,
    location: "global",
    ...over,
  };
}

test("clusters articles with the same normalized title into one event", () => {
  const events = mapArticlesToEvents(
    [
      art({ url: "https://a.com/1", title: "Big Thing Happens" }),
      art({ url: "https://b.com/2", title: "BIG THING happens!" }),
    ],
    now
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]!.volume, 2);
  assert.deepEqual(events[0]!.sources.sort(), ["https://a.com/1", "https://b.com/2"]);
});

test("event id is stable for the same title", () => {
  const a = mapArticlesToEvents([art({})], now)[0]!;
  const b = mapArticlesToEvents([art({ url: "https://z.com/9" })], now)[0]!;
  assert.equal(a.id, b.id);
});

test("tone is the mean of the cluster", () => {
  const e = mapArticlesToEvents(
    [art({ url: "https://a.com/1", tone: -4 }), art({ url: "https://b.com/2", tone: -2 })],
    now
  )[0]!;
  assert.equal(e.tone, -3);
});

test("latest_seen is the freshest article timestamp in the cluster", () => {
  const e = mapArticlesToEvents(
    [
      art({ url: "https://a.com/1", seendate: "2026-06-04T10:00:00Z" }),
      art({ url: "https://b.com/2", seendate: "2026-06-04T13:00:00Z" }),
    ],
    now
  )[0]!;
  assert.equal(e.latest_seen, "2026-06-04T13:00:00Z");
});

test("distinct titles produce distinct events", () => {
  const events = mapArticlesToEvents(
    [art({ title: "Thing One" }), art({ title: "Thing Two", url: "https://b.com/2" })],
    now
  );
  assert.equal(events.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `map.ts`**

```typescript
import { createHash } from "node:crypto";
import type { RawArticle, RadarEvent } from "./types.js";

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function eventId(normTitle: string): string {
  return "gdelt-" + createHash("sha1").update(normTitle).digest("hex").slice(0, 12);
}

export function mapArticlesToEvents(
  articles: RawArticle[],
  surfacedAt: string
): RadarEvent[] {
  const clusters = new Map<string, RawArticle[]>();
  for (const a of articles) {
    const key = normalizeTitle(a.title);
    if (!key) continue;
    const list = clusters.get(key) ?? [];
    list.push(a);
    clusters.set(key, list);
  }

  const events: RadarEvent[] = [];
  for (const [key, list] of clusters) {
    const sources = [...new Set(list.map((a) => a.url))];
    const tone = Number(
      (list.reduce((s, a) => s + a.tone, 0) / list.length).toFixed(4)
    );
    const latestSeen = list
      .map((a) => a.seendate)
      .sort()
      .at(-1)!; // ISO strings sort lexically == chronologically
    events.push({
      id: eventId(key),
      title: list[0]!.title,
      summary: list[0]!.title, // MVP: no synopsis from GDELT ArtList; title stands in
      location: list[0]!.location,
      tone,
      volume: list.length,
      score: 0, // filled by orchestrator using rank.ts
      sources,
      surfaced_at: surfacedAt,
      latest_seen: latestSeen,
      promoted: false,
    });
  }
  return events;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm test`
Expected: PASS (map + rank tests).

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ssnn-outputs && git add event-radar/src/map.ts event-radar/tests/map.test.ts && git commit -m "feat(event-radar): cluster articles into events"
```

---

### Task 5: Radar state — promoted source of truth (TDD)

**Files:**
- Create: `~/Desktop/ssnn-outputs/event-radar/src/state.ts`
- Test: `~/Desktop/ssnn-outputs/event-radar/tests/state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadState, saveState, markSeen, isPromoted } from "../src/state.js";

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), "radar-")), "radar-state.json");
}

test("loadState returns empty state when file is missing", async () => {
  const s = await loadState(join(tmpdir(), "nope-radar-xyz.json"));
  assert.deepEqual(s, { seen: {}, promoted: [] });
});

test("markSeen records a first-seen timestamp once", async () => {
  const s = { seen: {}, promoted: [] };
  markSeen(s, "gdelt-1", "2026-06-04T14:00:00Z");
  markSeen(s, "gdelt-1", "2026-06-04T15:00:00Z");
  assert.equal(s.seen["gdelt-1"], "2026-06-04T14:00:00Z");
});

test("isPromoted reflects the promoted list", () => {
  assert.equal(isPromoted({ seen: {}, promoted: ["gdelt-1"] }, "gdelt-1"), true);
  assert.equal(isPromoted({ seen: {}, promoted: [] }, "gdelt-1"), false);
});

test("saveState then loadState round-trips", async () => {
  const f = tmpFile();
  await saveState(f, { seen: { a: "t" }, promoted: ["a"] });
  assert.deepEqual(await loadState(f), { seen: { a: "t" }, promoted: ["a"] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `state.ts`**

```typescript
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { RadarState } from "./types.js";

export async function loadState(path: string): Promise<RadarState> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as RadarState;
  } catch {
    return { seen: {}, promoted: [] };
  }
}

export async function saveState(path: string, state: RadarState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, path); // atomic
}

export function markSeen(state: RadarState, id: string, when: string): void {
  if (!state.seen[id]) state.seen[id] = when;
}

export function isPromoted(state: RadarState, id: string): boolean {
  return state.promoted.includes(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ssnn-outputs && git add event-radar/src/state.ts event-radar/tests/state.test.ts && git commit -m "feat(event-radar): radar state (promoted source of truth)"
```

---

### Task 6: Atomic events-file writer (TDD)

**Files:**
- Create: `~/Desktop/ssnn-outputs/event-radar/src/events-file.ts`
- Test: `~/Desktop/ssnn-outputs/event-radar/tests/events-file.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeEventsFile } from "../src/events-file.js";
import type { RadarEvent } from "../src/types.js";

function ev(id: string, score: number): RadarEvent {
  return { id, title: id, summary: id, location: "global", tone: 0, volume: 1, score,
    sources: [], surfaced_at: "t", latest_seen: "t", promoted: false };
}

test("writes top-N events sorted by score desc, stamping promoted ids", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ev-"));
  const out = join(dir, "events.json");
  await writeEventsFile(out, [ev("a", 0.1), ev("b", 0.9), ev("c", 0.5)], {
    promotedIds: ["c"], cap: 2, generatedAt: "2026-06-04T14:00:00Z",
  });
  const parsed = JSON.parse(readFileSync(out, "utf-8"));
  assert.equal(parsed.events.length, 2);
  assert.deepEqual(parsed.events.map((e: RadarEvent) => e.id), ["b", "c"]);
  assert.equal(parsed.events.find((e: RadarEvent) => e.id === "c").promoted, true);
  assert.equal(parsed.generated_at, "2026-06-04T14:00:00Z");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `events-file.ts`**

```typescript
import { writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { RadarEvent, EventsFile } from "./types.js";

export interface WriteOpts {
  promotedIds: string[];
  cap: number;
  generatedAt: string;
}

export async function writeEventsFile(
  path: string,
  events: RadarEvent[],
  { promotedIds, cap, generatedAt }: WriteOpts
): Promise<void> {
  const ranked = [...events].sort((a, b) => b.score - a.score).slice(0, cap);
  const promoted = new Set(promotedIds);
  const stamped = ranked.map((e) => ({ ...e, promoted: promoted.has(e.id) }));
  const file: EventsFile = { generated_at: generatedAt, events: stamped };
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(file, null, 2));
  await rename(tmp, path); // atomic — never a partial feed
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ssnn-outputs && git add event-radar/src/events-file.ts event-radar/tests/events-file.test.ts && git commit -m "feat(event-radar): atomic events.json writer"
```

---

### Task 7: Config

**Files:**
- Create: `~/Desktop/ssnn-outputs/event-radar/src/config.ts`

- [ ] **Step 1: Write `config.ts`**

```typescript
import { join } from "node:path";

const HOME = process.env.HOME;
if (!HOME) throw new Error("HOME not set");

export const RADAR_DIR = join(HOME, "Desktop/ssnn-outputs/event-radar");
export const EVENTS_FILE = join(RADAR_DIR, "events.json");
export const STATE_FILE = join(RADAR_DIR, "radar-state.json");

// GDELT DOC 2.0 API. `query` differs per feed; London feed adds a UK filter.
export const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
export const GLOBAL_QUERY = "(breaking OR crisis OR announces OR resigns OR attack)";
export const LONDON_QUERY = "London sourcecountry:UK";

export const EVENT_CAP = 15;
export const MAX_ARTICLES_PER_QUERY = 75;
```

- [ ] **Step 2: tsc + commit**

```bash
cd ~/Desktop/ssnn-outputs/event-radar && npx tsc --noEmit
cd ~/Desktop/ssnn-outputs && git add event-radar/src/config.ts && git commit -m "feat(event-radar): config"
```

---

### Task 8: GDELT client (integration — manual-verify the live shape)

**Files:**
- Create: `~/Desktop/ssnn-outputs/event-radar/src/gdelt.ts`

> **Manual verification required:** GDELT's exact JSON field names must be
> confirmed against a live response (`mode=ArtList&format=json` returns an
> `articles` array). Run the curl in Step 2 and adjust the field mapping in
> `normalizeArticle` to match what you actually see before relying on it.

- [ ] **Step 1: Write `gdelt.ts`**

```typescript
import type { RawArticle, RadarLocation } from "./types.js";
import { GDELT_DOC_URL, MAX_ARTICLES_PER_QUERY } from "./config.js";

interface GdeltRaw {
  articles?: Array<{
    url: string;
    title: string;
    domain: string;
    seendate: string;
    // tone may arrive as a string; some modes omit it — default 0.
    tone?: string | number;
  }>;
}

export type FetchJson = (url: string) => Promise<GdeltRaw>;

const defaultFetch: FetchJson = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "SandboxDaily/0.1 event-radar" } });
  if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
  return (await res.json()) as GdeltRaw;
};

function buildUrl(query: string): string {
  const p = new URLSearchParams({
    query,
    mode: "ArtList",
    format: "json",
    maxrecords: String(MAX_ARTICLES_PER_QUERY),
    sort: "DateDesc",
    timespan: "1d",
  });
  return `${GDELT_DOC_URL}?${p.toString()}`;
}

function normalizeArticle(
  a: NonNullable<GdeltRaw["articles"]>[number],
  location: RadarLocation
): RawArticle {
  const seen = /^\d{8}T\d{6}Z$/.test(a.seendate)
    ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}T${a.seendate.slice(9, 11)}:${a.seendate.slice(11, 13)}:${a.seendate.slice(13, 15)}Z`
    : a.seendate;
  return {
    url: a.url,
    title: a.title,
    domain: a.domain,
    seendate: seen,
    tone: typeof a.tone === "string" ? Number(a.tone) || 0 : a.tone ?? 0,
    location,
  };
}

export async function fetchArticles(
  query: string,
  location: RadarLocation,
  fetchJson: FetchJson = defaultFetch
): Promise<RawArticle[]> {
  const raw = await fetchJson(buildUrl(query));
  return (raw.articles ?? []).map((a) => normalizeArticle(a, location));
}
```

- [ ] **Step 2: Manually verify the live response shape**

Run: `curl -s "https://api.gdeltproject.org/api/v2/doc/doc?query=London%20sourcecountry:UK&mode=ArtList&format=json&maxrecords=5&timespan=1d" | head -c 1200`
Expected: JSON with an `articles` array. Confirm each item has `url`, `title`, `domain`, `seendate`. If `tone` is absent in this mode, leave the `?? 0` default (ranking still works on volume + recency). Adjust `normalizeArticle` field names if they differ.

- [ ] **Step 3: tsc + commit**

```bash
cd ~/Desktop/ssnn-outputs/event-radar && npx tsc --noEmit
cd ~/Desktop/ssnn-outputs && git add event-radar/src/gdelt.ts && git commit -m "feat(event-radar): GDELT DOC 2.0 client"
```

---

### Task 9: Orchestrator + first real run

**Files:**
- Create: `~/Desktop/ssnn-outputs/event-radar/src/index.ts`

- [ ] **Step 1: Write `index.ts`**

```typescript
import { fetchArticles } from "./gdelt.js";
import { mapArticlesToEvents } from "./map.js";
import { scoreEvent } from "./rank.js";
import { loadState, saveState, markSeen } from "./state.js";
import { writeEventsFile } from "./events-file.js";
import {
  EVENTS_FILE, STATE_FILE, GLOBAL_QUERY, LONDON_QUERY, EVENT_CAP,
} from "./config.js";

function ageHours(iso: string, now: number): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 24 : Math.max(0, (now - t) / 3_600_000);
}

async function main(): Promise<void> {
  const now = new Date();
  const nowMs = now.getTime();
  const generatedAt = now.toISOString();

  const [global, london] = await Promise.all([
    fetchArticles(GLOBAL_QUERY, "global"),
    fetchArticles(LONDON_QUERY, "london"),
  ]);

  const events = mapArticlesToEvents([...global, ...london], generatedAt).map((e) => ({
    ...e,
    score: scoreEvent({
      volume: e.volume,
      tone: e.tone,
      ageHours: ageHours(e.latest_seen, nowMs),
    }),
  }));

  const state = await loadState(STATE_FILE);
  for (const e of events) markSeen(state, e.id, generatedAt);
  await saveState(STATE_FILE, state);

  await writeEventsFile(EVENTS_FILE, events, {
    promotedIds: state.promoted,
    cap: EVENT_CAP,
    generatedAt,
  });

  console.log(`[radar] wrote ${Math.min(events.length, EVENT_CAP)} events → ${EVENTS_FILE}`);
}

main().catch((err) => {
  console.error("[radar] fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the agent for real**

Run: `cd ~/Desktop/ssnn-outputs/event-radar && npm start`
Expected: logs "wrote N events"; `events.json` exists with a sorted `events` array.

- [ ] **Step 3: Inspect the output**

Run: `python3 -c "import json;d=json.load(open('events.json'));print(len(d['events']));print(d['events'][0]['title'], d['events'][0]['score'])"`
Expected: a count and a plausible top event with a score.

- [ ] **Step 4: Full test + tsc + commit**

```bash
cd ~/Desktop/ssnn-outputs/event-radar && npm test && npx tsc --noEmit
cd ~/Desktop/ssnn-outputs && git add event-radar/src/index.ts && git commit -m "feat(event-radar): orchestrator + end-to-end run"
```

---

### Task 10: launchd plist + README

**Files:**
- Create: `~/Library/LaunchAgents/com.sandboxdaily.event-radar.plist`
- Create: `~/Desktop/ssnn-outputs/event-radar/README.md`

- [ ] **Step 1: Read an existing plist to match the pattern**

Run: `cat ~/Library/LaunchAgents/com.sandboxdaily.pipeline.plist`
Expected: shows the working pattern (ProgramArguments, StartCalendarInterval/StartInterval, Standard*Path). Mirror it.

- [ ] **Step 2: Write `com.sandboxdaily.event-radar.plist`** (hourly)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sandboxdaily.event-radar</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string><string>-lc</string>
    <string>cd "$HOME/Desktop/ssnn-outputs/event-radar" && /opt/homebrew/bin/npm start</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>StandardOutPath</key><string>/tmp/event-radar.log</string>
  <key>StandardErrorPath</key><string>/tmp/event-radar.err.log</string>
</dict>
</plist>
```

- [ ] **Step 3: Load it**

Run: `launchctl unload ~/Library/LaunchAgents/com.sandboxdaily.event-radar.plist 2>/dev/null; launchctl load ~/Library/LaunchAgents/com.sandboxdaily.event-radar.plist && echo loaded`
Expected: "loaded"; after the next hour (or `launchctl start com.sandboxdaily.event-radar`), `/tmp/event-radar.log` shows a run.

- [ ] **Step 4: Write `README.md`** (what it does, how to run manually, where output goes) and commit.

```bash
cd ~/Desktop/ssnn-outputs && git add event-radar/README.md && git commit -m "docs(event-radar): readme + launchd plist"
```

---

## STAGE B — Admin dashboard (`sandbox-daily`)

> Work in the `sandbox-daily` repo for all Stage B tasks.

### Task 11: Read the Next.js docs + path-bridge pattern (REQUIRED FIRST)

- [ ] **Step 1: Read the project's pinned Next.js routing + route-handler + server-component data-fetching guides**

Run: `ls ~/Desktop/Sandbox\ Daily/sandbox-daily/node_modules/next/dist/docs/ && echo "---" && sed -n '1,200p' ~/Desktop/Sandbox\ Daily/sandbox-daily/node_modules/next/dist/docs/*routing* 2>/dev/null | head -200`
Expected: confirms the version's conventions (this is NOT standard Next.js per AGENTS.md). Note any deprecations before writing routes/pages.

- [ ] **Step 2: Read the existing workflow dashboard + path bridge to copy the pattern**

Run: `cat ~/Desktop/Sandbox\ Daily/sandbox-daily/src/lib/workflow/paths.ts && echo "--- page ---" && sed -n '1,80p' ~/Desktop/Sandbox\ Daily/sandbox-daily/src/app/admin/workflow/page.tsx`
Expected: shows how the site locates ssnn-outputs files and renders an admin page. Stage B mirrors this exactly.

- [ ] **Step 3: No commit (reading only).**

---

### Task 12: Radar paths + server reader

**Files:**
- Create: `src/lib/radar/paths.ts`
- Create: `src/lib/radar/events.ts`

- [ ] **Step 1: Write `src/lib/radar/paths.ts`** following `src/lib/workflow/paths.ts`

```typescript
import { join } from "node:path";
import { homedir } from "node:os";

const SSNN_OUTPUTS = process.env.SSNN_OUTPUTS_DIR ?? join(homedir(), "Desktop/ssnn-outputs");

export const EVENTS_FILE = join(SSNN_OUTPUTS, "event-radar/events.json");
export const RADAR_STATE_FILE = join(SSNN_OUTPUTS, "event-radar/radar-state.json");
export const RESEARCH_LEADS_DIR = join(SSNN_OUTPUTS, "research-leads");
```

- [ ] **Step 2: Write `src/lib/radar/events.ts`** (server-only)

```typescript
import "server-only";
import { readFile } from "node:fs/promises";
import { EVENTS_FILE } from "./paths.js";

export interface RadarEvent {
  id: string; title: string; summary: string;
  location: "global" | "london"; tone: number; volume: number;
  score: number; sources: string[]; surfaced_at: string;
  latest_seen: string; promoted: boolean;
}
export interface EventsFile { generated_at: string; events: RadarEvent[]; }

export async function readEvents(): Promise<EventsFile> {
  try {
    return JSON.parse(await readFile(EVENTS_FILE, "utf-8")) as EventsFile;
  } catch {
    return { generated_at: "", events: [] };
  }
}
```

- [ ] **Step 3: tsc + commit**

```bash
cd ~/Desktop/Sandbox\ Daily/sandbox-daily && npx tsc --noEmit
git add src/lib/radar/ && git commit -m "feat(radar-ui): events path bridge + reader"
```

---

### Task 13: Promote route handler

**Files:**
- Create: `src/app/admin/radar/promote/route.ts`

> Follow the route-handler signature confirmed in Task 11 (the pinned Next.js
> version may differ from standard `Request`/`Response`). Adjust accordingly.

- [ ] **Step 1: Write `route.ts`**

```typescript
import { writeFile, mkdir, rename, readFile } from "node:fs/promises";
import { join } from "node:path";
import { RESEARCH_LEADS_DIR, RADAR_STATE_FILE } from "@/lib/radar/paths";
import { readEvents } from "@/lib/radar/events";

export async function POST(req: Request): Promise<Response> {
  const { event_id } = (await req.json()) as { event_id?: string };
  if (!event_id) return Response.json({ error: "event_id required" }, { status: 400 });

  const { events } = await readEvents();
  const event = events.find((e) => e.id === event_id);
  if (!event) return Response.json({ error: "unknown event_id" }, { status: 404 });

  // 1) write the lead (atomic)
  await mkdir(RESEARCH_LEADS_DIR, { recursive: true });
  const lead = {
    event_id: event.id, title: event.title, summary: event.summary,
    sources: event.sources, location: event.location,
    promoted_at: new Date().toISOString(),
  };
  const dest = join(RESEARCH_LEADS_DIR, `${event.id}.json`);
  const tmp = `${dest}.tmp`;
  await writeFile(tmp, JSON.stringify(lead, null, 2));
  await rename(tmp, dest);

  // 2) mark promoted in radar-state (source of truth)
  let state: { seen: Record<string, string>; promoted: string[] };
  try { state = JSON.parse(await readFile(RADAR_STATE_FILE, "utf-8")); }
  catch { state = { seen: {}, promoted: [] }; }
  if (!state.promoted.includes(event.id)) state.promoted.push(event.id);
  const stmp = `${RADAR_STATE_FILE}.tmp`;
  await writeFile(stmp, JSON.stringify(state, null, 2));
  await rename(stmp, RADAR_STATE_FILE);

  return Response.json({ ok: true });
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd ~/Desktop/Sandbox\ Daily/sandbox-daily && npx tsc --noEmit
git add src/app/admin/radar/promote/route.ts && git commit -m "feat(radar-ui): promote route writes lead + marks state"
```

---

### Task 14: Radar page + client list

**Files:**
- Create: `src/app/admin/radar/page.tsx`
- Create: `src/app/admin/radar/RadarList.tsx`

- [ ] **Step 1: Write `page.tsx`** (server component; mirror `admin/workflow/page.tsx`)

```tsx
import { readEvents } from "@/lib/radar/events";
import { RadarList } from "./RadarList";

export const dynamic = "force-dynamic"; // always read the latest events.json

export default async function RadarPage() {
  const { generated_at, events } = await readEvents();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-1">Event Radar</h1>
      <p className="text-sm text-neutral-500 mb-6">
        {generated_at ? `Updated ${new Date(generated_at).toLocaleString()}` : "No feed yet"}
      </p>
      <RadarList events={events} />
    </main>
  );
}
```

- [ ] **Step 2: Write `RadarList.tsx`** (client component with Promote)

```tsx
"use client";
import { useState } from "react";
import type { RadarEvent } from "@/lib/radar/events";

export function RadarList({ events }: { events: RadarEvent[] }) {
  const [promoted, setPromoted] = useState<Set<string>>(
    new Set(events.filter((e) => e.promoted).map((e) => e.id))
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function promote(id: string) {
    setBusy(id);
    const res = await fetch("/admin/radar/promote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: id }),
    });
    if (res.ok) setPromoted((p) => new Set(p).add(id));
    setBusy(null);
  }

  if (events.length === 0) return <p>No events surfaced yet.</p>;
  return (
    <ul className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="border rounded-lg p-4 flex justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase px-2 py-0.5 rounded bg-neutral-100">{e.location}</span>
              <span className="text-xs text-neutral-500">vol {e.volume} · tone {e.tone} · score {e.score}</span>
            </div>
            <h2 className="font-medium mt-1">{e.title}</h2>
            <p className="text-sm text-neutral-600">{e.summary}</p>
            <div className="text-xs text-neutral-400 mt-1">
              {e.sources.slice(0, 3).map((s) => (
                <a key={s} href={s} target="_blank" rel="noreferrer" className="underline mr-2">source</a>
              ))}
            </div>
          </div>
          <button
            disabled={promoted.has(e.id) || busy === e.id}
            onClick={() => promote(e.id)}
            className="self-start px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-40"
          >
            {promoted.has(e.id) ? "Promoted" : busy === e.id ? "…" : "Promote"}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Run the dev server and click through**

Run: `cd ~/Desktop/Sandbox\ Daily/sandbox-daily && npm run dev` then open `/admin/radar`.
Expected: ranked events render; clicking Promote flips the button to "Promoted" and writes `~/Desktop/ssnn-outputs/research-leads/<id>.json`.

- [ ] **Step 4: Verify the lead landed**

Run: `ls ~/Desktop/ssnn-outputs/research-leads/ && cat ~/Desktop/ssnn-outputs/research-leads/*.json | head -20`
Expected: a well-formed lead file for the promoted event.

- [ ] **Step 5: tsc + commit**

```bash
cd ~/Desktop/Sandbox\ Daily/sandbox-daily && npx tsc --noEmit
git add src/app/admin/radar/ && git commit -m "feat(radar-ui): radar dashboard page + promote"
```

---

## STAGE C — `research-agent`

### Task 15: Scaffold + types

**Files:**
- Create: `~/Desktop/ssnn-outputs/research-agent/{package.json,tsconfig.json}`
- Create: `~/Desktop/ssnn-outputs/research-agent/src/types.ts`

- [ ] **Step 1: Scaffold (copy image-agent pattern)**

```bash
cd ~/Desktop/ssnn-outputs
mkdir -p research-agent/src research-agent/tests
cp image-agent/tsconfig.json research-agent/tsconfig.json
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "ssnn-research-agent",
  "version": "0.1.0",
  "description": "Turns promoted radar leads into research docs for the writer pipeline",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "node --import tsx --test tests/*.test.ts"
  },
  "dependencies": {},
  "devDependencies": { "tsx": "^4.19.0", "typescript": "^5.7.0", "@types/node": "^22.0.0" }
}
```

- [ ] **Step 3: Write `src/types.ts`**

```typescript
export interface Lead {
  event_id: string;
  title: string;
  summary: string;
  sources: string[];
  location: "global" | "london";
  promoted_at: string;
}

export interface DocInputs {
  title: string;
  primaryUrl: string;
  publication: string;
  dateHuman: string;
  summary: string;
  /** Markdown body sections produced by Claude from the sources. */
  bodySections: string;
  eventId: string;
  generatedAt: string;
}
```

- [ ] **Step 4: install + tsc + commit**

```bash
cd ~/Desktop/ssnn-outputs/research-agent && npm install && npx tsc --noEmit
cd ~/Desktop/ssnn-outputs && git add research-agent/package.json research-agent/tsconfig.json research-agent/src/types.ts && git commit -m "feat(research-agent): scaffold + types"
```

---

### Task 16: Slug + unique filename (TDD)

**Files:**
- Create: `~/Desktop/ssnn-outputs/research-agent/src/slug.ts`
- Test: `~/Desktop/ssnn-outputs/research-agent/tests/slug.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, researchDocFilename } from "../src/slug.js";

test("slugify lowercases, strips punctuation, hyphenates", () => {
  assert.equal(slugify("Bank of England HOLDS rates!"), "bank-of-england-holds-rates");
});

test("slugify truncates very long titles to <= 60 chars", () => {
  const s = slugify("word ".repeat(40));
  assert.ok(s.length <= 60, `len ${s.length}`);
});

test("researchDocFilename prefixes the date and ends in .md", () => {
  assert.equal(
    researchDocFilename("Big News", new Date("2026-06-04T10:00:00Z")),
    "2026-06-04-big-news.md"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Desktop/ssnn-outputs/research-agent && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `slug.ts`**

```typescript
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function researchDocFilename(title: string, when: Date): string {
  const date = when.toISOString().slice(0, 10);
  return `${date}-${slugify(title)}.md`;
}
```

- [ ] **Step 4: Run + commit**

```bash
cd ~/Desktop/ssnn-outputs/research-agent && npm test
cd ~/Desktop/ssnn-outputs && git add research-agent/src/slug.ts research-agent/tests/slug.test.ts && git commit -m "feat(research-agent): slug + filename"
```

---

### Task 17: Research-doc assembly (TDD)

**Files:**
- Create: `~/Desktop/ssnn-outputs/research-agent/src/research-doc.ts`
- Test: `~/Desktop/ssnn-outputs/research-agent/tests/research-doc.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResearchDoc } from "../src/research-doc.js";

const inputs = {
  title: "Bank of England Holds Rates",
  primaryUrl: "https://bbc.co.uk/x",
  publication: "BBC",
  dateHuman: "4 June 2026",
  summary: "The BoE held rates at 4.5%.",
  bodySections: "## Key Facts\n- Held at 4.5%\n",
  eventId: "gdelt-abc123",
  generatedAt: "2026-06-04T14:13:00Z",
};

test("frontmatter marks source: radar and the event id", () => {
  const md = buildResearchDoc(inputs);
  assert.match(md, /^---\n[\s\S]*source: radar[\s\S]*event_id: gdelt-abc123[\s\S]*\n---/);
});

test("includes title, source block, summary and body sections", () => {
  const md = buildResearchDoc(inputs);
  assert.match(md, /# Bank of England Holds Rates/);
  assert.match(md, /\*\*Source:\*\* BBC/);
  assert.match(md, /\*\*URL:\*\* https:\/\/bbc\.co\.uk\/x/);
  assert.match(md, /## Summary\nThe BoE held rates at 4\.5%\./);
  assert.match(md, /## Key Facts/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Desktop/ssnn-outputs/research-agent && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `research-doc.ts`**

```typescript
import type { DocInputs } from "./types.js";

export function buildResearchDoc(i: DocInputs): string {
  return `---
source: radar
event_id: ${i.eventId}
generated_at: ${i.generatedAt}
---

# ${i.title}

**Source:** ${i.publication}
**Date:** ${i.dateHuman}
**URL:** ${i.primaryUrl}

---

## Summary
${i.summary}

${i.bodySections.trim()}
`;
}
```

- [ ] **Step 4: Run + commit**

```bash
cd ~/Desktop/ssnn-outputs/research-agent && npm test
cd ~/Desktop/ssnn-outputs && git add research-agent/src/research-doc.ts research-agent/tests/research-doc.test.ts && git commit -m "feat(research-agent): research-doc assembly"
```

---

### Task 18: Leads I/O (TDD)

**Files:**
- Create: `~/Desktop/ssnn-outputs/research-agent/src/leads.ts`
- Test: `~/Desktop/ssnn-outputs/research-agent/tests/leads.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listLeads, moveLead } from "../src/leads.js";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "leads-"));
  writeFileSync(join(dir, "gdelt-1.json"), JSON.stringify({
    event_id: "gdelt-1", title: "T", summary: "S", sources: ["https://a"],
    location: "global", promoted_at: "t",
  }));
  writeFileSync(join(dir, "notes.txt"), "ignore me");
  return dir;
}

test("listLeads returns only parsed .json leads", async () => {
  const dir = setup();
  const leads = await listLeads(dir);
  assert.equal(leads.length, 1);
  assert.equal(leads[0]!.lead.event_id, "gdelt-1");
});

test("moveLead relocates the file into a subdir", async () => {
  const dir = setup();
  const [{ path }] = await listLeads(dir);
  await moveLead(path, join(dir, ".processed"));
  assert.ok(!existsSync(path));
  assert.ok(existsSync(join(dir, ".processed", "gdelt-1.json")));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Desktop/ssnn-outputs/research-agent && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `leads.ts`**

```typescript
import { readdir, readFile, mkdir, rename } from "node:fs/promises";
import { join, basename } from "node:path";
import type { Lead } from "./types.js";

export interface LoadedLead { path: string; lead: Lead; }

export async function listLeads(dir: string): Promise<LoadedLead[]> {
  let names: string[];
  try { names = await readdir(dir); } catch { return []; }
  const out: LoadedLead[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(dir, name);
    try { out.push({ path, lead: JSON.parse(await readFile(path, "utf-8")) as Lead }); }
    catch { /* skip malformed */ }
  }
  return out;
}

export async function moveLead(path: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await rename(path, join(destDir, basename(path)));
}
```

- [ ] **Step 4: Run + commit**

```bash
cd ~/Desktop/ssnn-outputs/research-agent && npm test
cd ~/Desktop/ssnn-outputs && git add research-agent/src/leads.ts research-agent/tests/leads.test.ts && git commit -m "feat(research-agent): leads I/O"
```

---

### Task 19: Config + Claude/source clients (integration)

**Files:**
- Create: `~/Desktop/ssnn-outputs/research-agent/src/config.ts`
- Create: `~/Desktop/ssnn-outputs/research-agent/src/sources.ts`
- Create: `~/Desktop/ssnn-outputs/research-agent/src/claude.ts`

- [ ] **Step 1: Write `config.ts`**

```typescript
import { join } from "node:path";
const HOME = process.env.HOME;
if (!HOME) throw new Error("HOME not set");

export const LEADS_DIR = join(HOME, "Desktop/ssnn-outputs/research-leads");
export const PROCESSED_DIR = join(LEADS_DIR, ".processed");
export const ERRORS_DIR = join(LEADS_DIR, ".errors");
export const RESEARCH_DOCS_DIR = join(HOME, "Desktop/ssnn-outputs/research-docs");
export const CLAUDE_CLI = "/opt/homebrew/bin/claude";
```

- [ ] **Step 2: Write `sources.ts`** (best-effort fetch of source article text)

```typescript
export async function fetchSourceText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "SandboxDaily/0.1 research-agent" } });
    if (!res.ok) return "";
    const html = await res.text();
    // crude strip — Claude only needs rough context, not clean DOM.
    return html.replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 6000);
  } catch { return ""; }
}
```

- [ ] **Step 3: Write `claude.ts`** (mirror how image-agent's `llm.ts` shells the Claude CLI — read it first)

Run first: `cat ~/Desktop/ssnn-outputs/image-agent/src/llm.ts`
Then write `claude.ts` matching that invocation style:

```typescript
import { execFile } from "node:child_process";
import { CLAUDE_CLI } from "./config.js";

const SYSTEM = `You are a research analyst for Sandbox Daily. Given a news event and
raw source text, produce ONLY the markdown BODY SECTIONS of a research brief
(do NOT include frontmatter, the title, the Source block, or the Summary —
those are added by the caller). Use ## headers, bullet points, and tables where
useful. Cover: what happened, the key facts/data, context, and the non-obvious
angle a sharp writer could take. Ground every claim in the supplied sources;
never invent figures.`;

export function generateBodySections(eventTitle: string, sourceText: string): Promise<string> {
  const prompt = `EVENT: ${eventTitle}\n\nSOURCE TEXT:\n"""\n${sourceText}\n"""\n\nReturn the markdown body sections only.`;
  return new Promise((resolve, reject) => {
    execFile(
      CLAUDE_CLI,
      ["--print", "--append-system-prompt", SYSTEM],
      { maxBuffer: 4 * 1024 * 1024, timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`claude failed: ${err.message}\n${stderr}`));
        resolve(stdout.trim());
      }
    ).stdin?.end(prompt);
  });
}
```

> Adjust the CLI flags to match `image-agent/src/llm.ts` exactly — that file is
> the source of truth for how this machine invokes Claude.

- [ ] **Step 4: tsc + commit**

```bash
cd ~/Desktop/ssnn-outputs/research-agent && npx tsc --noEmit
cd ~/Desktop/ssnn-outputs && git add research-agent/src/config.ts research-agent/src/sources.ts research-agent/src/claude.ts && git commit -m "feat(research-agent): config + source/claude clients"
```

---

### Task 20: Orchestrator + end-to-end

**Files:**
- Create: `~/Desktop/ssnn-outputs/research-agent/src/index.ts`

- [ ] **Step 1: Write `index.ts`**

```typescript
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { listLeads, moveLead } from "./leads.js";
import { researchDocFilename } from "./slug.js";
import { buildResearchDoc } from "./research-doc.js";
import { fetchSourceText } from "./sources.js";
import { generateBodySections } from "./claude.js";
import { LEADS_DIR, PROCESSED_DIR, ERRORS_DIR, RESEARCH_DOCS_DIR } from "./config.js";

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "source"; }
}

async function main(): Promise<void> {
  const leads = await listLeads(LEADS_DIR);
  const realLeads = leads.filter((l) => !l.path.includes("/.")); // skip .processed/.errors
  if (realLeads.length === 0) { console.log("[research] no leads"); return; }

  for (const { path, lead } of realLeads) {
    try {
      const primaryUrl = lead.sources[0] ?? "";
      const sourceText = primaryUrl ? await fetchSourceText(primaryUrl) : "";
      const bodySections = await generateBodySections(lead.title, sourceText);
      const now = new Date();
      const md = buildResearchDoc({
        title: lead.title,
        primaryUrl,
        publication: domainOf(primaryUrl),
        dateHuman: now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
        summary: lead.summary,
        bodySections,
        eventId: lead.event_id,
        generatedAt: now.toISOString(),
      });
      await mkdir(RESEARCH_DOCS_DIR, { recursive: true });
      const dest = join(RESEARCH_DOCS_DIR, researchDocFilename(lead.title, now));
      await writeFile(dest, md);
      await moveLead(path, PROCESSED_DIR);
      console.log(`[research] wrote ${dest}`);
    } catch (err) {
      console.error(`[research] FAILED ${lead.event_id}: ${(err as Error).message}`);
      await moveLead(path, ERRORS_DIR).catch(() => {});
    }
  }
}

main().catch((err) => { console.error("[research] fatal:", err); process.exit(1); });
```

- [ ] **Step 2: End-to-end run against a real promoted lead**

Run: (after promoting one event in the dashboard) `cd ~/Desktop/ssnn-outputs/research-agent && npm start`
Expected: logs "wrote …/research-docs/2026-06-04-….md"; the lead moved to `.processed/`.

- [ ] **Step 3: Verify the research doc is well-formed + writer can see it**

Run: `head -25 ~/Desktop/ssnn-outputs/research-docs/$(ls -t ~/Desktop/ssnn-outputs/research-docs | head -1)`
Expected: frontmatter `source: radar`, title, Source block, `## Summary`, body sections. (Optional: `cd ~/Desktop/ssnn-outputs/writer-agent && npm start -- --hours 1 --dry-run` and confirm it picks up the new doc.)

- [ ] **Step 4: full test + tsc + commit**

```bash
cd ~/Desktop/ssnn-outputs/research-agent && npm test && npx tsc --noEmit
cd ~/Desktop/ssnn-outputs && git add research-agent/src/index.ts && git commit -m "feat(research-agent): orchestrator + end-to-end"
```

---

### Task 21: launchd plist + README

**Files:**
- Create: `~/Library/LaunchAgents/com.sandboxdaily.research-agent.plist`
- Create: `~/Desktop/ssnn-outputs/research-agent/README.md`

- [ ] **Step 1: Write the plist** (every 3 min = 180s)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sandboxdaily.research-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string><string>-lc</string>
    <string>cd "$HOME/Desktop/ssnn-outputs/research-agent" && /opt/homebrew/bin/npm start</string>
  </array>
  <key>StartInterval</key><integer>180</integer>
  <key>StandardOutPath</key><string>/tmp/research-agent.log</string>
  <key>StandardErrorPath</key><string>/tmp/research-agent.err.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Load + verify**

Run: `launchctl unload ~/Library/LaunchAgents/com.sandboxdaily.research-agent.plist 2>/dev/null; launchctl load ~/Library/LaunchAgents/com.sandboxdaily.research-agent.plist && echo loaded`
Expected: "loaded"; `/tmp/research-agent.log` shows "no leads" or a write within 3 min.

- [ ] **Step 3: Write README + commit**

```bash
cd ~/Desktop/ssnn-outputs && git add research-agent/README.md && git commit -m "docs(research-agent): readme + launchd plist"
```

---

## Final integration check

- [ ] **Step 1: Full loop, lights-on**

1. `cd ~/Desktop/ssnn-outputs/event-radar && npm start` → events.json populated.
2. Open `/admin/radar`, Promote one event → lead file appears.
3. `cd ~/Desktop/ssnn-outputs/research-agent && npm start` → research doc in `research-docs/`.
4. Confirm both launchd agents are loaded: `launchctl list | grep sandboxdaily`.

- [ ] **Step 2: Confirm coexistence**

Run: `ls -t ~/Desktop/ssnn-outputs/research-docs | head -5`
Expected: the new radar doc sits alongside any OpenClaw ad-hoc docs; filenames don't collide.

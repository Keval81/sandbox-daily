# Night Edition Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Planet Pulse globe becomes the landing-page hero ("Night Edition"), replacing the London-brain video; front-door identity (nav on `/`, one footer line) follows; the mid-page teaser dies.

**Architecture:** A pure derivation module (`src/lib/pulse/hero.ts`) computes everything the hero says from a `PulseSnapshot` — mode, totals, per-layer index chips, category whisper, aside — fully unit-tested including dishonesty paths. Components stay thin: `NightHero` (server) renders the strings; a small client wrapper adds tap-to-open; `GlobeEngine` gains a `dragOnly` interaction option (drag binds, pick/hover/zoom/keys stay off). Spec: `docs/superpowers/specs/2026-07-31-night-edition-rebrand-design.md`.

**Tech Stack:** Next.js (App Router, ISR), TypeScript strict, node:test via `npm run test:lib`, hand-rolled canvas engine (no 3D lib).

## Global Constraints

- Branch: `feat/night-edition` off **main**, only after `feat/planet-pulse` has merged (Task 0 guards this).
- Existing tokens only: ink `#111111`, cream `#F5EED8`, orange `#E75D31`, accent `#56A077`, grey `#6E655B`; fonts Playfair/Source Serif/Plex Mono. No new colours, fonts, or dependencies.
- Lib tests MUST live at `src/lib/pulse/*.test.ts` (npm's `sh` glob expands exactly one directory deep — a deeper path silently never runs).
- The engine may never know hazard concepts — markers only (`Marker` in `src/lib/pulse/types.ts`).
- Liveness travels with data (`SourceStatus[]`/`freshnessOf`), never promise state, never defaulted true.
- Layer-proof: no code may assume `"hazards"` is the only layer. The two-layer fixture in Task 1 pins this.
- Masthead copy, verbatim: `Sandbox Daily` (italic `Daily` in orange), strapline `THE PLANET, FACT-CHECKED DAILY`, hint `DRAG TO TURN · TAP TO OPEN · ↓ TODAY'S STORIES`.
- TypeScript strict, no `any`; `const` over `let`; named exports; no `console.log` in production code.
- Run all lib tests with: `npm run test:lib`. One test file: `node --import tsx --test src/lib/pulse/hero.test.ts`.

---

### Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Verify the pulse branch has merged**

Run: `git -C ~/Desktop/Sandbox\ Daily/sandbox-daily checkout main && git pull && git log --oneline -5 | cat`
Expected: commits from `feat/planet-pulse` (GDACS, spec/plan docs) present on main. **If not merged: STOP — the rollout order is a spec decision (pulse ships first).**

- [ ] **Step 2: Create the branch**

Run: `git checkout -b feat/night-edition`
Expected: `Switched to a new branch 'feat/night-edition'`

Work in the main tree (`~/Desktop/Sandbox Daily/sandbox-daily`) — the pulse worktree can be removed after merge. Note: `git status` first; the old hero-mobile WIP touching `page.tsx`/`globals.css` is **dead work by SanSan's call** — stash it (`git stash push -m "hero-mobile WIP, retired by night-edition"`) rather than carrying it.

---

### Task 1: Hero derivation — mode, totals, chips, whisper

**Files:**
- Create: `src/lib/pulse/hero.ts`
- Test: `src/lib/pulse/hero.test.ts`

**Interfaces:**
- Consumes: `PulseSnapshot`, `PulseLayerSummary`, `LayerEvent` from `./types`; `freshnessOf`, `everySourceDead` from `./freshness`.
- Produces (later tasks rely on these exact names):

```ts
export interface IndexChip { layerId: string; label: string; score: number; band: string; color: string }
export interface WhisperEntry { label: string; count: number }
export interface HeroStatus {
  mode: "live" | "snapshot";
  generatedAt: string;            // ISO; component formats it
  totalEvents: number | null;     // null = withheld (snapshot mode)
  indexChips: IndexChip[];        // one per LIVE layer with an index; [] in snapshot mode
  whisper: WhisperEntry[];        // top 4 categories by count, live layers only; [] in snapshot mode
  aside: string | null;           // Task 2; null until then and in snapshot mode
}
export const deriveHeroStatus = (snapshot: PulseSnapshot, now: number): HeroStatus
```

- [ ] **Step 1: Write the failing tests** — `src/lib/pulse/hero.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveHeroStatus } from "./hero";
import type { LayerEvent, PulseLayerSummary, PulseSnapshot } from "./types";

const GENERATED = "2026-07-31T12:00:00.000Z";
const NOW = Date.parse(GENERATED);

const event = (over: Partial<LayerEvent>): LayerEvent => ({
  id: "usgs:x1", layer: "hazards", category: "earthquake", title: "Somewhere",
  lat: 10, lon: 20, date: GENERATED, severity: 0.5, source: "USGS", ...over,
});

// Two layers, deliberately: pins the wars/unrest future as a data change.
const hazards = (over: Partial<PulseLayerSummary> = {}): PulseLayerSummary => ({
  id: "hazards", label: "hazard",
  categories: {
    earthquake: { label: "Earthquake", color: "#E75D31", weight: 0.8 },
    flood: { label: "Flood", color: "#56A077", weight: 0.6 },
  },
  categoryOrder: ["earthquake", "flood"],
  sources: [{ id: "usgs", label: "USGS", live: true }],
  live: true,
  index: { score: 84, band: "Severe", color: "#FF2D55" },
  ...over,
});
const unrest = (over: Partial<PulseLayerSummary> = {}): PulseLayerSummary => ({
  id: "unrest", label: "unrest",
  categories: { protest: { label: "Protest", color: "#FFD60A", weight: 0.5 } },
  categoryOrder: ["protest"],
  sources: [{ id: "radar", label: "Radar", live: true }],
  live: true,
  index: { score: 30, band: "Elevated", color: "#FFD60A" },
  ...over,
});
const snap = (layers: PulseLayerSummary[], events: LayerEvent[], stale = false): PulseSnapshot =>
  ({ generatedAt: GENERATED, stale, events, unplottable: 0, layers });

test("live snapshot: totals count all live layers' events, layer-agnostic", () => {
  const s = snap([hazards(), unrest()], [
    event({ id: "a" }), event({ id: "b", category: "flood" }),
    event({ id: "c", layer: "unrest", category: "protest" }),
  ]);
  const h = deriveHeroStatus(s, NOW);
  assert.equal(h.mode, "live");
  assert.equal(h.totalEvents, 3);
});

test("index chips: one per live layer with an index, never a combined score", () => {
  const h = deriveHeroStatus(snap([hazards(), unrest()], [event({})]), NOW);
  assert.deepEqual(h.indexChips.map((c) => c.layerId), ["hazards", "unrest"]);
  assert.equal(h.indexChips[0].score, 84);
  assert.equal(h.indexChips[1].band, "Elevated");
});

test("a dead layer contributes no chip and no events to the total", () => {
  const deadUnrest = unrest({ live: false, sources: [{ id: "radar", label: "Radar", live: false }], index: null });
  const s = snap([hazards(), deadUnrest], [
    event({ id: "a" }), event({ id: "c", layer: "unrest", category: "protest" }),
  ]);
  const h = deriveHeroStatus(s, NOW);
  assert.equal(h.mode, "live");           // one live layer keeps the pip green
  assert.equal(h.totalEvents, 1);         // the dead layer's event is not counted
  assert.deepEqual(h.indexChips.map((c) => c.layerId), ["hazards"]);
});

test("whisper: top 4 category labels by count across live layers", () => {
  const events = [
    event({ id: "1" }), event({ id: "2" }), event({ id: "3", category: "flood" }),
    event({ id: "4", layer: "unrest", category: "protest" }),
  ];
  const h = deriveHeroStatus(snap([hazards(), unrest()], events), NOW);
  assert.deepEqual(h.whisper, [
    { label: "Earthquake", count: 2 },
    { label: "Flood", count: 1 },
    { label: "Protest", count: 1 },
  ]);
});

test("stale snapshot: mode snapshot, everything withheld", () => {
  const h = deriveHeroStatus(snap([hazards()], [event({})], true), NOW);
  assert.equal(h.mode, "snapshot");
  assert.equal(h.totalEvents, null);
  assert.deepEqual(h.indexChips, []);
  assert.deepEqual(h.whisper, []);
});

test("every source dead: mode snapshot even when the snapshot is not stale", () => {
  const dead = hazards({ live: false, sources: [{ id: "usgs", label: "USGS", live: false }], index: null });
  const h = deriveHeroStatus(snap([dead], [event({})]), NOW);
  assert.equal(h.mode, "snapshot");
  assert.equal(h.totalEvents, null);
});

test("an aged snapshot left open goes snapshot mode (freshnessOf rule)", () => {
  const h = deriveHeroStatus(snap([hazards()], [event({})]), NOW + 21 * 60 * 1000);
  assert.equal(h.mode, "snapshot");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test src/lib/pulse/hero.test.ts`
Expected: FAIL — `Cannot find module './hero'`

- [ ] **Step 3: Implement** — `src/lib/pulse/hero.ts`:

```ts
import { freshnessOf } from "./freshness";
import type { PulseSnapshot } from "./types";

export interface IndexChip { layerId: string; label: string; score: number; band: string; color: string }
export interface WhisperEntry { label: string; count: number }

export interface HeroStatus {
  mode: "live" | "snapshot";
  generatedAt: string;
  /** null = withheld. The hero never prints a number it doesn't trust. */
  totalEvents: number | null;
  indexChips: IndexChip[];
  whisper: WhisperEntry[];
  aside: string | null;
}

const WHISPER_MAX = 4;

/**
 * Everything the hero is allowed to say, derived once. Layer-agnostic by
 * construction: totals span every live layer, indexes stay per-layer (a single
 * combined planet score cannot honestly rank a viral video against a quake).
 */
export const deriveHeroStatus = (snapshot: PulseSnapshot, now: number): HeroStatus => {
  const { live } = freshnessOf(snapshot, now);
  if (!live) {
    return { mode: "snapshot", generatedAt: snapshot.generatedAt,
             totalEvents: null, indexChips: [], whisper: [], aside: null };
  }

  const liveLayers = snapshot.layers.filter((l) => l.live);
  const liveIds = new Set(liveLayers.map((l) => l.id));
  const events = snapshot.events.filter((e) => liveIds.has(e.layer));

  const indexChips: IndexChip[] = liveLayers.flatMap((l) =>
    l.index ? [{ layerId: l.id, label: l.label, ...l.index }] : []);

  const counts = new Map<string, number>();          // "layerId:category" → count
  for (const e of events) {
    const key = `${e.layer}:${e.category}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const labelFor = (key: string): string => {
    const [layerId, category] = key.split(":");
    return snapshot.layers.find((l) => l.id === layerId)?.categories[category]?.label ?? category;
  };
  const whisper: WhisperEntry[] = [...counts.entries()]
    .map(([key, count]) => ({ label: labelFor(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, WHISPER_MAX);

  return { mode: "live", generatedAt: snapshot.generatedAt,
           totalEvents: events.length, indexChips, whisper, aside: null };
};
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --import tsx --test src/lib/pulse/hero.test.ts`
Expected: all PASS

- [ ] **Step 5: Full lib suite + commit**

Run: `npm run test:lib`
Expected: previous count + 7 new, all passing.

```bash
git add src/lib/pulse/hero.ts src/lib/pulse/hero.test.ts
git commit -m "feat: hero derivation — mode, totals, per-layer chips, whisper"
```

---

### Task 2: Asides, marker mapping, and the throwing-fetch regression

**Files:**
- Modify: `src/lib/pulse/hero.ts`
- Test: `src/lib/pulse/hero.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's `deriveHeroStatus`; `Marker` from `./types`; `buildSnapshot` from `./snapshot` (regression test only).
- Produces:

```ts
export const markersFromSnapshot = (snapshot: PulseSnapshot, dimmed: boolean): Marker[]
// deriveHeroStatus now fills `aside` (string | null) on the live path.
```

- [ ] **Step 1: Write the failing tests** (append to `hero.test.ts`):

```ts
import { markersFromSnapshot } from "./hero";
import { buildSnapshot } from "./snapshot";

test("aside comes from the worst live band's pool, deterministically by day", () => {
  const h = deriveHeroStatus(snap([hazards(), unrest()], [event({})]), NOW);
  // worst band across chips is Severe (84); same generatedAt → same line
  const again = deriveHeroStatus(snap([hazards(), unrest()], [event({})]), NOW);
  assert.equal(typeof h.aside, "string");
  assert.equal(h.aside, again.aside);
});

test("zero events with live feeds gets a real 'nothing to report' aside", () => {
  const calm = hazards({ index: { score: 0, band: "Calm", color: "#56A077" } });
  const h = deriveHeroStatus(snap([calm], []), NOW);
  assert.equal(h.totalEvents, 0);
  assert.match(h.aside ?? "", /quiet|nothing|day off/i);
});

test("no live band → no aside (asides never fabricate)", () => {
  const noIndex = hazards({ index: null });
  const h = deriveHeroStatus(snap([noIndex], [event({})]), NOW);
  assert.equal(h.aside, null);
});

test("markers colour by the event's OWN layer; dimming greys and shrinks", () => {
  const s = snap([hazards(), unrest()], [
    event({ id: "a" }),                                        // earthquake → #E75D31
    event({ id: "c", layer: "unrest", category: "protest" }),  // protest → #FFD60A
  ]);
  const [a, c] = markersFromSnapshot(s, false);
  assert.equal(a.color, "#E75D31");
  assert.equal(c.color, "#FFD60A");
  const [dimA] = markersFromSnapshot(s, true);
  assert.equal(dimA.color, "#98989D");
  assert.ok(dimA.weight < a.weight);
});

test("REGRESSION: both feeds throwing drives the hero to snapshot mode", async () => {
  // Real layer machinery, real thrown fetches — no fabricated {status:"rejected"}.
  const throwing = {
    id: "hazards", label: "hazard", categories: {}, categoryOrder: [],
    fetch: async () => { throw new Error("feed down"); },
  };
  const s = await buildSnapshot([throwing]);
  const h = deriveHeroStatus(s, Date.parse(s.generatedAt));
  assert.equal(h.mode, "snapshot");
  assert.equal(h.totalEvents, null);
  assert.deepEqual(h.indexChips, []);
});
```

Note: check `buildSnapshot`'s exact signature in `src/lib/pulse/snapshot.ts:5` before writing — mirror how `snapshot.test.ts` calls it (registry argument shape, and whether the throwing source needs `sources` handling). Copy the calling convention from the existing regression test in that file.

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test src/lib/pulse/hero.test.ts`
Expected: FAIL — `markersFromSnapshot` not exported; aside `null` where a string is expected.

- [ ] **Step 3: Implement** (append/modify in `hero.ts`):

```ts
import type { Marker, PulseSnapshot } from "./types";

/** 6-digit hex, deliberately: the engine appends an alpha pair to marker colours. */
const FALLBACK_COLOR = "#98989D";
const DIM_COLOR = "#98989D";
const DIM_WEIGHT = 0.6;

export const markersFromSnapshot = (snapshot: PulseSnapshot, dimmed: boolean): Marker[] => {
  const byLayer = new Map(snapshot.layers.map((l) => [l.id, l.categories]));
  return snapshot.events.map((e) => ({
    id: e.id, lat: e.lat, lon: e.lon,
    color: dimmed ? DIM_COLOR : byLayer.get(e.layer)?.[e.category]?.color ?? FALLBACK_COLOR,
    weight: dimmed ? e.severity * DIM_WEIGHT : e.severity,
  }));
};

/** Worst first. Bands come from each layer's own index model. */
const BAND_ORDER = ["Severe", "High", "Elevated", "Calm"];

const ASIDES: Record<string, string[]> = {
  Calm: ["— a quiet day, mostly", "— the planet, behaving itself", "— all things considered, calm"],
  Elevated: ["— a restless day out there", "— the planet has notes today", "— some grumbling underfoot"],
  High: ["— a rough day in places", "— parts of the planet are having a day", "— not everywhere is having a good day"],
  Severe: ["— a hard day for the planet", "— the planet is shouting today", "— rough out there, genuinely"],
  none: ["— nothing to report. enjoy it", "— all quiet, genuinely", "— the planet took the day off"],
};

/** Deterministic (varies by day, stable within one): no Math.random — the
 *  server render and hydration must agree, and tests must too. */
const pickAside = (pool: string[], generatedAt: string): string => {
  const day = Math.floor(Date.parse(generatedAt) / 86_400_000);
  return pool[day % pool.length];
};

const asideFor = (chips: IndexChip[], totalEvents: number, generatedAt: string): string | null => {
  if (totalEvents === 0) return pickAside(ASIDES.none, generatedAt);
  const worst = BAND_ORDER.find((b) => chips.some((c) => c.band === b));
  if (!worst) return null;                       // no band → no aside, never invent
  return pickAside(ASIDES[worst], generatedAt);
};
```

Wire into `deriveHeroStatus`'s live return: `aside: asideFor(indexChips, events.length, snapshot.generatedAt)`.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --import tsx --test src/lib/pulse/hero.test.ts` then `npm run test:lib`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pulse/hero.ts src/lib/pulse/hero.test.ts
git commit -m "feat: hero asides + marker mapping; throwing-fetch regression covers the hero path"
```

---

### Task 3: Engine `dragOnly` + `PulseGlobe` ambient prop

**Files:**
- Modify: `src/lib/pulse/globe-engine/engine.ts` (options at ~line 13, `bindEvents` at ~line 230)
- Modify: `src/components/pulse/pulse-globe.tsx`
- Modify: `src/app/globals.css` (one class)

**Interfaces:**
- Consumes: existing `GlobeEngine` options `{ compact?: boolean }`, existing `PulseGlobeProps`.
- Produces: `GlobeEngine` option `dragOnly?: boolean`; `PulseGlobe` prop `ambient?: boolean` (implies compact layout + drag-only interaction). Task 4 renders `<PulseGlobe markers={…} ambient spin />`.

No DOM test harness exists in this repo (node:test only, no jsdom — adding one is a new dependency and out of scope). Verification is typecheck + the manual drag check in Step 4. Keep the diff minimal.

- [ ] **Step 1: Engine option**

In the options interface add `dragOnly?: boolean;` and store `private readonly dragOnly: boolean;` set from `options.dragOnly ?? false` in the constructor. In `bindEvents()`:

```ts
private bindEvents(): void {
  // Compact mode is a picture, not an instrument — unless the host asks for
  // dragOnly (the landing hero): drag binds, pick/hover/zoom/keys stay off.
  if (this.compact && !this.dragOnly) return;
  // ...existing pointerdown/pointermove/pointerup listeners unchanged, except:
```

Guard the non-drag behaviours inside the existing handlers and skip the rest of the bindings:

```ts
    // in pointermove — hover is a full-instrument behaviour:
    if (this.dragging) { /* unchanged drag maths */ return; }
    if (this.dragOnly) return;           // no hover emit, no hot cursor
    // ...existing hover branch unchanged

    // in pointerup — tap-to-pick is a full-instrument behaviour:
    if (!this.dragOnly && this.dragging && !moved) { /* unchanged emitPick */ }

    // after pointerleave binding:
    if (this.dragOnly) return;           // no wheel zoom, no pinch, no keys
    // ...existing wheel/touchstart/keyboard bindings unchanged
```

Order the returns so `pointerdown`/`pointermove`/`pointerup`/`pointerleave` are bound before the `dragOnly` early-return, and wheel/pinch/keyboard after it.

- [ ] **Step 2: PulseGlobe prop**

In `pulse-globe.tsx`: add `ambient?: boolean` to `PulseGlobeProps` (default `false`). Construct with `new GlobeEngine(canvas, { compact: compact || ambient, dragOnly: ambient })` and include `ambient` in that effect's dependency array alongside `compact`. Canvas attrs: treat ambient like compact for a11y (`tabIndex -1`, `aria-hidden`) — the hero copy beside it is the accessible content. Add the class:

```tsx
className={ambient ? "pulse-canvas pulse-canvas--ambient" : "pulse-canvas"}
```

- [ ] **Step 3: CSS**

In `globals.css`, near `.pulse-canvas`:

```css
/* Horizontal drag rotates; vertical stays with the page. A full-viewport hero
   that eats vertical touch is a scroll dead zone (the teaser lesson). */
.pulse-canvas--ambient { touch-action: pan-y; cursor: grab; }
.pulse-canvas--ambient.grabbing { cursor: grabbing; }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run test:lib`
Expected: clean, suite green.
Manual (dev server, any page embedding an ambient globe — completable in Task 4 if none exists yet): drag rotates; no tooltip, no zoom on wheel, page scrolls over the hero on touch.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pulse/globe-engine/engine.ts src/components/pulse/pulse-globe.tsx src/app/globals.css
git commit -m "feat: ambient globe mode — drag-only interaction for the landing hero"
```

---

### Task 4: `NightHero` + homepage swap

**Files:**
- Create: `src/components/night-hero.tsx` (server)
- Create: `src/components/night-hero-globe.tsx` (client: tap-to-open wrapper)
- Modify: `src/app/page.tsx` (video hero out, NightHero in)
- Modify: `src/app/globals.css` (`.night-hero*` styles; leave `.sd-hero*` for Task 5's sweep)

**Interfaces:**
- Consumes: `deriveHeroStatus`, `markersFromSnapshot` (Task 1/2), `PulseGlobe` ambient (Task 3), `formatStamp` from `@/components/pulse/format`, `getPulseSnapshot` (already called by the page).
- Produces: `NightHero({ snapshot }: { snapshot: PulseSnapshot })`; `NightHeroGlobe({ markers }: { markers: Marker[] })`.

- [ ] **Step 1: Client globe wrapper** — `night-hero-globe.tsx`:

```tsx
"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { PulseGlobe } from "@/components/pulse/pulse-globe";
import type { Marker } from "@/lib/pulse/types";

const TAP_SLOP_PX = 6;

/** Drag rotates; a true tap (no travel) opens /pulse. A Link wrapper can't
 *  make that distinction — it would navigate at the end of every drag. */
export function NightHeroGlobe({ markers }: { markers: Marker[] }) {
  const router = useRouter();
  const down = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="night-hero-globe"
      onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < TAP_SLOP_PX) {
          router.push("/pulse");
        }
      }}
    >
      <img src="/images/pulse-globe-poster.webp" alt="" className="night-hero-poster" />
      <PulseGlobe markers={markers} ambient spin />
    </div>
  );
}
```

The poster `<img>` sits under the canvas: it paints before hydration, stays if JS is off, and remains behind a `failed` canvas — the page never blanks. (Asset arrives in Task 8; until then the img 404s harmlessly in dev.)

- [ ] **Step 2: Server hero** — `night-hero.tsx`:

```tsx
import Link from "next/link";
import { NightHeroGlobe } from "@/components/night-hero-globe";
import { formatStamp } from "@/components/pulse/format";
import { deriveHeroStatus, markersFromSnapshot } from "@/lib/pulse/hero";
import type { PulseSnapshot } from "@/lib/pulse/types";

export function NightHero({ snapshot }: { snapshot: PulseSnapshot }) {
  // Seeded from generatedAt (freshnessOf's hydration-safe convention).
  const status = deriveHeroStatus(snapshot, Date.parse(snapshot.generatedAt));
  const markers = markersFromSnapshot(snapshot, status.mode === "snapshot");

  return (
    <section className="night-hero">
      <div className="night-hero-grain" aria-hidden />
      <h1 className="night-hero-masthead">
        Sandbox <em>Daily</em>
      </h1>
      <p className="night-hero-strapline">THE PLANET, FACT-CHECKED DAILY</p>

      <NightHeroGlobe markers={markers} />

      <p className="night-hero-stat">
        {status.mode === "live" ? (
          <>
            <span className="night-hero-pip" data-live>● LIVE</span>{" "}
            <span className="font-mono">{status.totalEvents} live events</span>
            {status.indexChips.map((c) => (
              <span key={c.layerId} className="font-mono night-hero-chip">
                {" · "}{c.label} index <b style={{ color: c.color }}>{c.score}</b>
              </span>
            ))}
            {status.aside && <span className="night-hero-aside"> {status.aside}</span>}
          </>
        ) : (
          <>
            <span className="night-hero-pip">◌ SNAPSHOT</span>{" "}
            <span className="font-mono">last checked {formatStamp(status.generatedAt)}</span>
          </>
        )}
      </p>

      {status.whisper.length > 0 && (
        <p className="night-hero-whisper font-mono">
          {status.whisper.map((w) => `${w.label} ${w.count}`).join(" · ")}
        </p>
      )}

      <p className="night-hero-hint">
        DRAG TO TURN · <Link href="/pulse">TAP TO OPEN</Link> · ↓ TODAY&rsquo;S STORIES
      </p>
    </section>
  );
}
```

Check `formatStamp`'s signature in `src/components/pulse/format.ts:35` — if it needs a second argument, mirror how `/pulse` calls it.

- [ ] **Step 3: Homepage swap** — in `page.tsx` replace the `<section className="sd-hero">…</section>` block (video, scrim, eyebrow — keep the `sr-only` h1 REMOVED: the masthead is now the visible h1) with:

```tsx
<NightHero snapshot={pulse} />
```

Imports: drop nothing else yet (teaser dies in Task 5). Add `import { NightHero } from "@/components/night-hero";`.

- [ ] **Step 4: CSS** — append to `globals.css` (tokens only; hero is the only grain surface):

```css
.night-hero {
  position: relative;
  min-height: 100dvh;               /* dvh, not vh — the iOS toolbar lesson */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--color-ink);
  color: var(--color-cream);
  overflow: hidden;
  padding: 72px 16px 40px;          /* clears the fixed nav */
}
.night-hero-grain {
  position: absolute; inset: 0; pointer-events: none; opacity: 0.06;
  background-image: radial-gradient(var(--color-cream) 0.5px, transparent 0.5px);
  background-size: 4px 4px;
}
.night-hero-masthead {
  font-family: var(--font-family-display);
  font-weight: 900;
  font-size: clamp(2.4rem, 7vw, 4.5rem);
  line-height: 1;
}
.night-hero-masthead em { font-style: italic; color: var(--color-orange); }
.night-hero-strapline {
  font-family: var(--font-family-mono);
  font-size: 0.6rem; letter-spacing: 0.3em;
  color: color-mix(in srgb, var(--color-cream) 60%, transparent);
}
.night-hero-globe {
  position: relative;
  width: min(64vw, 420px);
  aspect-ratio: 1;
}
.night-hero-poster {
  position: absolute; inset: 0; width: 100%; height: 100%;
}
.night-hero-stat { font-size: 0.85rem; text-align: center; }
.night-hero-pip { color: color-mix(in srgb, var(--color-cream) 55%, var(--color-ink)); }
.night-hero-pip[data-live] { color: var(--color-accent); }
.night-hero-stat .font-mono { font-variant-numeric: tabular-nums; }
.night-hero-aside { font-style: italic; opacity: 0.65; }
.night-hero-whisper {
  font-size: 0.6rem; letter-spacing: 0.15em;
  color: color-mix(in srgb, var(--color-cream) 45%, var(--color-ink));
}
.night-hero-hint {
  position: absolute; bottom: 12px; left: 0; right: 0;
  text-align: center;
  font-family: var(--font-family-mono);
  font-size: 0.6rem; letter-spacing: 0.2em;
  color: color-mix(in srgb, var(--color-cream) 50%, var(--color-ink));
}
.night-hero-hint a { color: inherit; text-decoration: underline; }
@media (max-width: 480px) {
  .night-hero-globe { width: min(78vw, 340px); }
}
```

- [ ] **Step 5: Verify server-rendered truth**

Run: `npm run dev -- --port 3006` (background), then:
`curl -s http://localhost:3006/ | grep -o "THE PLANET, FACT-CHECKED DAILY"` → exactly once;
`curl -s http://localhost:3006/ | grep -o "live events\|SNAPSHOT"` → one of the two, matching feed reality;
`curl -s http://localhost:3006/ | grep -c "london-hero"` → 0.
Browser: globe spins + drags, tap opens /pulse, page scrolls over hero on touch-emulation, seam into ticker/grid intact.

- [ ] **Step 6: Full checks + commit**

Run: `npx tsc --noEmit && npm run lint && npm run test:lib`

```bash
git add src/components/night-hero.tsx src/components/night-hero-globe.tsx src/app/page.tsx src/app/globals.css
git commit -m "feat: Night Edition hero — masthead over ambient globe replaces video hero"
```

---

### Task 5: Teaser + video-hero removal

**Files:**
- Delete: `src/components/pulse/pulse-teaser.tsx`
- Modify: `src/app/page.tsx` (drop `<PulseTeaser>` + import)
- Modify: `src/app/globals.css` (remove `.pulse-teaser*` block ~line 989 and `.sd-hero*` blocks ~lines 263–350 incl. media queries)

Video assets (`public/video/london-hero.mp4`, `public/images/london-hero-poster.webp`) STAY in the repo — spec decision.

- [ ] **Step 1: Remove usages, then the file**

In `page.tsx` remove the `PulseTeaser` import and JSX. Delete the component: `git rm src/components/pulse/pulse-teaser.tsx`.

- [ ] **Step 2: Sweep the CSS**

Remove every `.pulse-teaser*` rule and every `.sd-hero*` rule (including inside media queries).

- [ ] **Step 3: Prove no orphans**

Run: `grep -rn "PulseTeaser\|pulse-teaser\|sd-hero" src/ && echo LEFTOVERS || echo CLEAN`
Expected: `CLEAN`.
Run: `npx tsc --noEmit && npm run lint && npm run test:lib && npm run build`
Expected: all green — the build catches anything grep can't.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: retire the video hero styles and the pulse teaser — the hero does their jobs now"
```

---

### Task 6: Nav transparent over the hero

**Files:**
- Modify: `src/components/nav.tsx` (already `"use client"`)
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: existing `Nav`, `usePathname`.
- Produces: no API change — behaviour only. On `/`: nav starts transparent with the wordmark hidden (the masthead does that job); past ~70% of the viewport it gains its ink background and typewriter wordmark. Other routes: exactly as today.

- [ ] **Step 1: Scroll state**

```tsx
const pathname = usePathname();
const onHero = pathname === "/";
const [scrolled, setScrolled] = useState(!onHero);

useEffect(() => {
  if (!onHero) { setScrolled(true); return; }
  const threshold = () => window.innerHeight * 0.7;
  const update = () => setScrolled(window.scrollY > threshold());
  update();
  window.addEventListener("scroll", update, { passive: true });
  return () => window.removeEventListener("scroll", update);
}, [onHero]);
```

Apply: `<nav className={`fixed top-0 left-0 right-0 z-30 sd-nav ${scrolled ? "sd-nav--solid" : "sd-nav--overlay"}`}>` — replacing the hard-coded `bg-ink`. Wrap the wordmark `<Link>`'s `TypewriterText` so it only renders when `scrolled` (conditional render restarts the typewriter on appearance — acceptable; it's the component's existing entrance behaviour).

- [ ] **Step 2: CSS**

```css
.sd-nav { transition: background-color 240ms ease; }
.sd-nav--solid { background: var(--color-ink); }
.sd-nav--overlay { background: transparent; }
```

- [ ] **Step 3: Verify**

Dev server: on `/` nav starts transparent, no wordmark; scrolling past the hero fades ink in + types the wordmark; `/news` etc. unchanged (solid from load). `npx tsc --noEmit && npm run lint`.

- [ ] **Step 4: Commit**

```bash
git add src/components/nav.tsx src/app/globals.css
git commit -m "feat: nav rides transparent over the hero, solidifies on scroll"
```

---

### Task 7: Footer live index line

**Files:**
- Modify: `src/components/footer.tsx` (becomes async)
- Modify: `src/app/globals.css` (if spacing needs a rule; prefer existing utility classes)

**Interfaces:**
- Consumes: `getPulseSnapshot` from `@/lib/pulse/snapshot` (600s in-process cache — no new upstream traffic), `deriveHeroStatus` (Task 1).
- Produces: one footer line, only when live: `planet pulse: <label> index <score>` linking `/pulse`. Withheld in snapshot mode — the footer never states a number the hero would refuse.

- [ ] **Step 1: Implement**

```tsx
import { getPulseSnapshot } from "@/lib/pulse/snapshot";
import { deriveHeroStatus } from "@/lib/pulse/hero";

export async function Footer() {
  const snapshot = await getPulseSnapshot();
  const status = deriveHeroStatus(snapshot, Date.parse(snapshot.generatedAt));
  // …existing JSX; inside the first column, under "News · Tech · Sport":
  {status.indexChips.length > 0 && (
    <p className="font-mono text-meta uppercase tracking-mono mt-2">
      <Link href="/pulse" className="text-grey hover:text-accent transition-colors">
        planet pulse:{" "}
        {status.indexChips.map((c, i) => (
          <span key={c.layerId}>
            {i > 0 && " · "}{c.label} index{" "}
            <span style={{ color: c.color }}>{c.score}</span>
          </span>
        ))}
      </Link>
    </p>
  )}
}
```

Check `getPulseSnapshot`'s exact signature at `src/lib/pulse/snapshot.ts:60` (it may take a registry/options argument — mirror how `page.tsx` calls it).

- [ ] **Step 2: Verify**

`curl -s http://localhost:3006/news | grep -o "planet pulse:"` → present (footer is global);
kill network / feeds down scenario is already covered by lib tests — visually the line simply disappears.
`npx tsc --noEmit && npm run lint && npm run build`.

- [ ] **Step 3: Commit**

```bash
git add src/components/footer.tsx src/app/globals.css
git commit -m "feat: footer carries the live pulse index — the parked footer question, answered"
```

---

### Task 8: Poster asset + final polish

**Files:**
- Create: `public/images/pulse-globe-poster.webp`
- Modify: `src/app/globals.css` (poster/canvas fade)

- [ ] **Step 1: Capture the poster from the real engine**

Dev server → `http://localhost:3006/pulse` in a browser, let the globe paint, then in DevTools console:

```js
document.querySelector(".pulse-canvas").toBlob(
  (b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b);
           a.download = "pulse-globe-poster.png"; a.click(); }, "image/png");
```

Convert + size (ImageMagick is on this machine): `magick pulse-globe-poster.png -resize 840x840 -quality 82 public/images/pulse-globe-poster.webp`

- [ ] **Step 2: Fade the canvas over the poster**

The engine adds `.ready` when textures load (and `.failed` when they don't). Mirror /pulse's opacity pattern for the hero:

```css
.night-hero-globe .pulse-canvas { opacity: 0; transition: opacity 400ms ease; }
.night-hero-globe .pulse-canvas.ready,
.night-hero-globe .pulse-canvas.failed { opacity: 1; }
```

(`.failed` still shows markers-over-starfield — honest; the poster sits behind either way.)

- [ ] **Step 3: Verify the three states**

1. Normal: poster flashes ≤1s, live globe fades over it.
2. DevTools → disable JS → reload: poster + masthead + stat line (server-rendered) still make a complete, honest page.
3. OS reduced motion: globe still, no marker pulse, drag works.

- [ ] **Step 4: Commit**

```bash
git add public/images/pulse-globe-poster.webp src/app/globals.css
git commit -m "feat: engine-rendered poster under the hero globe — the page never blanks"
```

---

### Task 9: Whole-branch verification

**Files:** none (verification only)

The seam-defect rule: per-task review cannot see defects BETWEEN locally-correct tasks. This pass drives the assembled branch.

- [ ] **Step 1: Full suite, cold**

Run: `npm run test:lib && npx tsc --noEmit && npm run lint && npm run build`
Expected: everything green; note the test count (baseline was 207 pre-branch).

- [ ] **Step 2: Seam checks (dev server, real feeds)**

- `/` hero stat numbers vs `/api/pulse` payload: same totals (no divergent derivations).
- Footer index vs hero chips: identical scores (same snapshot, same derivation).
- Homepage → tap globe → `/pulse`: full instrument loads, no double-fetch (600s cache — watch the network panel).
- Scroll seam: hero → ticker → grid → subscribe → footer, no layout jump at nav solidify point.
- 390px viewport: masthead, globe, stat line all inside the viewport, no overlap.
- The grep-gate: `grep -rn "sd-hero\|pulse-teaser\|PulseTeaser" src/` → empty.

- [ ] **Step 3: Honest-failure drill**

Temporarily point one fetch at an unreachable host (edit, don't commit): hero shows `● LIVE` with reduced totals. Point ALL fetches away: hero shows `◌ SNAPSHOT`, no index anywhere, footer line gone, globe dimmed-grey markers. Revert the edit; `git status` must be clean afterward.

- [ ] **Step 4: Hand to review + device pass**

Whole-branch code review (superpowers:requesting-code-review), then SanSan's device pass: iPhone `dvh` + touch scroll over hero, drag feel, reduced motion, 390px. Merge only after both.

---

## Self-Review (done at write time)

- **Spec coverage:** storyboard frames → Task 4 (hero) + Task 6 (nav) + Task 7 (footer); layer-proof contract → Tasks 1–2 fixtures; honesty rules → Tasks 1–2 + 9; ambient globe → Task 3; teaser/video retirement → Task 5; poster/JS-off → Tasks 4+8; rollout order → Task 0. Seam animation ("globe dims + parallaxes as cream slides over") deliberately reduced to a plain scroll boundary for v1 — the spec's frames read correctly without it; add as a follow-up if SanSan wants the drama. Whisper uses full category labels, not the storyboard's EQ/FL abbreviations — no invented abbreviation table (layer-proof).
- **Placeholder scan:** clean — every code step carries real code; the two "check exact signature" notes point at specific files/lines with a copy-the-convention instruction, which is knowledge transfer, not deferral.
- **Type consistency:** `HeroStatus`/`IndexChip`/`WhisperEntry`/`deriveHeroStatus`/`markersFromSnapshot` names match across Tasks 1, 2, 4, 7; `ambient`/`dragOnly` match across Tasks 3–4.

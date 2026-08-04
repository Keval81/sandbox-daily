# Globe Signal-vs-Texture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render editorial-grade events as interactive pins and bulk detections (FIRMS fires, minor quakes) as soft non-interactive embers, on both the front-page hero globe and /pulse.

**Architecture:** One pure tier function (`markerKindOf`) decides `"pin" | "ember"` per event. `Marker` gains a `kind` field stamped at both construction sites (hero `markersFromSnapshot`, /pulse client memo). The canvas engine's draw loop branches on `kind`; embers never receive a hit target so the existing hover/pick code skips them with no changes.

**Tech Stack:** TypeScript, node:test (via `npm run test:lib`), Canvas 2D (no test framework — visual verification via headless Chrome CDP).

**Spec:** `docs/superpowers/specs/2026-08-04-globe-signal-vs-texture-design.md`

## Global Constraints

- No new dependencies.
- No changes to fetch windows, source caps, merge/dedupe, news expiry, hazard-index counts, /pulse console list, or hero card behaviour.
- Lint baseline is 26 pre-existing findings (7 errors in `design-source/`, textures page, review annotator, hero) — zero NEW findings allowed.
- Every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Repo: `/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily`. Leave the pipeline's untracked files (`src/content/sport/2026-08-03-high-and-free.md`, `public/images/articles/high-and-free.png`) uncommitted.

---

### Task 1: The tier function

**Files:**
- Create: `src/lib/pulse/marker-kind.ts`
- Test: `src/lib/pulse/marker-kind.test.ts`

**Interfaces:**
- Consumes: `LayerEvent` from `./types`, `severityFromMagnitude` from `./severity`.
- Produces: `markerKindOf(event: LayerEvent): "pin" | "ember"` and `type MarkerKind = "pin" | "ember"` — Task 2 imports both.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/pulse/marker-kind.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import type { LayerEvent } from "./types";
import { markerKindOf } from "./marker-kind";
import { severityFromMagnitude, severityFromAlertLevel } from "./severity";

const event = (over: Partial<LayerEvent>): LayerEvent => ({
  id: "x:1",
  layer: "hazards",
  category: "earthquake",
  title: "An event",
  lat: 0,
  lon: 0,
  date: "2026-08-04T00:00:00.000Z",
  severity: 0.5,
  severityFrom: "magnitude",
  source: "USGS",
  ...over,
});

test("a FIRMS fire cluster is always an ember", () => {
  const e = event({ source: "FIRMS", category: "wildfire", severity: 1, severityFrom: "magnitude" });
  assert.equal(markerKindOf(e), "ember");
});

test("a quake at or above M5.5 is a pin", () => {
  const e = event({ severity: severityFromMagnitude(5.5) });
  assert.equal(markerKindOf(e), "pin");
});

test("a quake below M5.5 is an ember", () => {
  const e = event({ severity: severityFromMagnitude(5.4) });
  assert.equal(markerKindOf(e), "ember");
});

test("a quake with no measured magnitude is an ember even at high baseline severity", () => {
  const e = event({ severity: 0.9, severityFrom: "category" });
  assert.equal(markerKindOf(e), "ember");
});

test("a GDACS orange-alert quake clears the bar; a green one does not", () => {
  const orange = event({ source: "GDACS", severity: severityFromAlertLevel("Orange")! });
  const green = event({ source: "GDACS", severity: severityFromAlertLevel("Green")! });
  assert.equal(markerKindOf(orange), "pin");
  assert.equal(markerKindOf(green), "ember");
});

test("named hazards and headlines are pins regardless of severity", () => {
  for (const over of [
    { source: "GDACS", category: "flood", severity: 0.2 },
    { source: "EONET", category: "severeStorm", severity: 0.3, severityFrom: "category" as const },
    { source: "Radar", layer: "news", category: "headline", severity: 0.1 },
    { source: "GDACS", category: "volcano", severity: 0.35 },
  ]) {
    assert.equal(markerKindOf(event(over)), "pin", JSON.stringify(over));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily" && npm run test:lib 2>&1 | grep -E "marker-kind|^ℹ fail"`
Expected: FAIL — `Cannot find module ... marker-kind`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/pulse/marker-kind.ts
import type { LayerEvent } from "./types";
import { severityFromMagnitude } from "./severity";

export type MarkerKind = "pin" | "ember";

/** The editorial bar for a quake pin, in severity space — M5.5 through the
 *  same curve normalise-usgs derives severity with, so no display-string
 *  parsing. GDACS alert-level severities pass through the same comparison:
 *  Orange (0.65) and Red (0.95) clear it, Green (0.35) does not. */
const QUAKE_PIN_SEVERITY = severityFromMagnitude(5.5);

/**
 * What earns a pin. FIRMS clusters are unnamed raw satellite detections —
 * texture, never a pin. Quakes tier by measured magnitude; an unmeasured
 * quake severity is a category baseline, not a reading, so it cannot clear
 * an editorial bar. Everything else (GDACS current events, EONET open
 * incidents, radar headlines) is already curated or named upstream.
 */
export const markerKindOf = (event: LayerEvent): MarkerKind => {
  if (event.source === "FIRMS") return "ember";
  if (event.category === "earthquake") {
    return event.severityFrom === "magnitude" && event.severity >= QUAKE_PIN_SEVERITY
      ? "pin"
      : "ember";
  }
  return "pin";
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:lib 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: all pass, 0 fail (439 existing + 6 new = 445).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pulse/marker-kind.ts src/lib/pulse/marker-kind.test.ts
git commit -m "feat(pulse): markerKindOf — the editorial tier for globe markers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `kind` on the Marker, stamped at both construction sites

**Files:**
- Modify: `src/lib/pulse/types.ts` (Marker interface, ~line 24)
- Modify: `src/lib/pulse/hero.ts` (`markersFromSnapshot`, ~line 32)
- Modify: `src/components/pulse/pulse-client.tsx` (markers memo, ~line 111)
- Test: `src/lib/pulse/hero.test.ts` (append)

**Interfaces:**
- Consumes: `markerKindOf`, `MarkerKind` from `@/lib/pulse/marker-kind` (Task 1).
- Produces: `Marker.kind: MarkerKind` — Task 3's engine branches on it.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/pulse/hero.test.ts` (match the file's existing fixture helpers — read the top of the file first and reuse its snapshot builder; the shape below adapts to whatever the existing helper is named):

```ts
test("markersFromSnapshot stamps the editorial kind on every marker", () => {
  // Build a snapshot (using this file's existing fixture helper) containing:
  //  - one FIRMS wildfire event        -> expect kind "ember"
  //  - one GDACS flood event           -> expect kind "pin"
  // in a live layer, then:
  const markers = markersFromSnapshot(snapshot, false);
  const byId = new Map(markers.map((m) => [m.id, m.kind]));
  assert.equal(byId.get("firms:c1"), "ember");
  assert.equal(byId.get("gdacs:1"), "pin");
});

test("dimmed mode keeps both kinds, dimmed alike", () => {
  const markers = markersFromSnapshot(snapshot, true);
  assert.equal(markers.length, 2); // dead-layer filtering off in dimmed mode, kinds intact
  assert.ok(markers.every((m) => m.kind === "pin" || m.kind === "ember"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:lib 2>&1 | grep -E "stamps the editorial|dimmed mode keeps"`
Expected: FAIL — `kind` does not exist / TS error surfaces as test failure.

- [ ] **Step 3: Implement**

`src/lib/pulse/types.ts` — extend Marker:

```ts
export interface Marker {
  id: string;
  lat: number;
  lon: number;
  color: string;
  weight: number;      // 0..1 — drives spike height and dot radius
  /** Editorial tier: pins are interactive claims of significance; embers are
   *  ambient texture with no hover/pick target. See lib/pulse/marker-kind. */
  kind: "pin" | "ember";
}
```

`src/lib/pulse/hero.ts` — import `markerKindOf` and stamp `kind: markerKindOf(e)` in the event→marker map inside `markersFromSnapshot`.

`src/components/pulse/pulse-client.tsx` — same stamp in the markers memo:

```ts
const markers: Marker[] = useMemo(
  () =>
    visible.map((e) => ({
      id: e.id,
      lat: e.lat,
      lon: e.lon,
      color: metaOf(e)?.color ?? FALLBACK_COLOR,
      weight: e.severity,
      kind: markerKindOf(e),
    })),
  [visible, metaOf]
);
```

(Import: `import { markerKindOf } from "@/lib/pulse/marker-kind";`)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:lib 2>&1 | grep -E "^ℹ (tests|pass|fail)"` — 0 fail.
Also: `npx tsc --noEmit 2>&1 | head -5` if a `tsc` script is unavailable, else `npm run build` in Task 4 covers it. Any OTHER Marker construction site tsc finds (it will error on the missing `kind`) gets the same `markerKindOf` stamp — the type change is deliberately breaking so no site is missed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pulse/types.ts src/lib/pulse/hero.ts src/lib/pulse/hero.test.ts src/components/pulse/pulse-client.tsx
git commit -m "feat(pulse): markers carry their editorial kind to the globe

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Ember rendering in the engine

**Files:**
- Modify: `src/lib/pulse/globe-engine/engine.ts` (draw loop, lines ~506-575)

**Interfaces:**
- Consumes: `Marker.kind` (Task 2). `PlacedMarker extends Marker` so `kind` is already on placed markers; `setMarkers` spreads `...m` so no ingestion change is needed.
- Produces: rendered embers. No API change.

- [ ] **Step 1: Implement the branch**

Inside the `for (const [m, base] of drawable)` loop (currently starting `const col = m.color;`), wrap the existing pin path in `if (m.kind !== "ember") { ... }` and add the ember path FIRST (so the file reads ember-then-pin, cheap case first):

```ts
for (const [m, base] of drawable) {
  const col = m.color;
  if (m.kind === "ember") {
    // Ambient texture: one soft additive glow at the surface point. No stem,
    // no white core, no pulse ring — and no hit target: sx stays null (from
    // setMarkers), so pickAt() and the hover path skip embers untouched.
    const rad = (1.2 + m.weight * 2.2) * (0.7 + base[2] * 0.3) * bloom;
    const eg = ctx.createRadialGradient(base[0], base[1], 0, base[0], base[1], rad * 3);
    eg.addColorStop(0, withAlpha(col, "66"));
    eg.addColorStop(1, withAlpha(col, "00"));
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(base[0], base[1], rad * 3, 0, 7);
    ctx.fill();
    if (this.selected === m.id) {
      // Selection arrives from the /pulse console list — an ember has no
      // hover target of its own, but a picked one still shows where it is.
      ctx.strokeStyle = "#fff";
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(base[0], base[1], rad * 3 + 4, 0, 7);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    continue;
  }
  // ...existing pin rendering, unchanged, still setting m.sx/m.sy/m.sr...
}
```

Notes for the implementer:
- `withAlpha` already exists in this file (used at the pin bloom gradient).
- `"66"` is the alpha byte ≈ 0.4 from the spec; final value settled in Task 4 within the 0.3–0.5 band (`"4d"`–`"80"`).
- Do NOT touch the `m.sx = tipx` lines in the pin path; the `continue` above them is what keeps ember `sx` null.
- Line ~573 (`const drawn = new Set(...)`) includes ember ids — harmless; their `sx` is already null and stays null.

- [ ] **Step 2: Verify no test regressions and clean lint/build**

Run: `npm run test:lib 2>&1 | grep -E "^ℹ (tests|pass|fail)"` — 0 fail.
Run: `npm run lint 2>&1 | tail -1` — exactly the 26-problem baseline.
Run: `npm run build 2>&1 | grep -E "✓|error"` — compiles, 100 pages.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pulse/globe-engine/engine.ts
git commit -m "feat(pulse): embers render as ambient glow — texture, not claims

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Visual verification and ship

**Files:**
- None in-repo (scratchpad screenshots only). Possible one-line alpha tune in `engine.ts` from Step 2.

**Interfaces:**
- Consumes: the built app; the CDP screenshot pattern already proven this session (headless Chrome, `Emulation.setDeviceMetricsOverride`, script shape in scratchpad `cdp-verify.mjs`).

- [ ] **Step 1: Serve the production build**

```bash
cd "/Users/sandboxsansan/Desktop/Sandbox Daily/sandbox-daily" && npx next start -p 4123 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=9223 --user-data-dir=<scratchpad>/chrome-profile \
  --no-first-run --disable-gpu about:blank &
```

- [ ] **Step 2: Screenshot four states and eyeball them**

Via CDP (`Page.captureScreenshot` after `setDeviceMetricsOverride`, allowing ~4s for globe texture load): `/` at 1280×720, `/` at 390×844, `/pulse` at 1280×720, `/pulse` at 390×844. Read each image and confirm against the spec's checklist: fire belts read as glow fields; pins legible and countable (~75–90); no white smears; a pin hover card still opens on the front page (drive one `Input.dispatchMouseEvent` over a pin's coordinates or verify via the audit expression that `night-hero-card` appears). If ember glow reads too loud/quiet, adjust the `"66"` alpha byte within `"4d"`–`"80"`, rebuild, reshoot; commit the tune with the verification commit below if any.

- [ ] **Step 3: Count check**

CDP `Runtime.evaluate` on `/pulse`: markers with hit targets vs total —
expected: interactive ≈ 75–90, total ≈ 350 (today's data; exact numbers move
with the feeds). The engine exposes neither directly; evaluate via
`window.__pulseDebug` if present, else assert visually from the screenshots
and the "ON THE GLOBE RIGHT NOW" counts (which must be UNCHANGED from before
the branch — embers still counted).

- [ ] **Step 4: Kill servers, push, confirm deploy**

```bash
pkill -f "remote-debugging-port=9223"; pkill -f "next start -p 4123"
git push origin main
# poll https://sandbox-daily.vercel.app until the deploy for the new HEAD is READY,
# then reshoot / at 390x844 against production and confirm embers render there.
```

- [ ] **Step 5: Registry**

Append the shipped line to the Sandbox Daily entry in `~/brain/PROJECTS.md` (before the "Definition of done" bullet), bump nothing else, commit ~/brain:

```bash
git -C ~/brain add -A && git -C ~/brain commit -m "registry: globe signal-vs-texture shipped — pins editorial, fires as ember field"
```

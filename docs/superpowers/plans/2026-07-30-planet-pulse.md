# Planet Pulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/pulse` — a public, live natural-hazard globe on Sandbox Daily, fed by NASA EONET + USGS through a cached server route, with a homepage teaser linking to it.

**Architecture:** Four independently testable units. (1) `src/lib/pulse/` — pure normalisers, severity curve, hazard index, cross-source dedupe, and a layer registry; every layer produces one normalised `LayerEvent` shape. (2) `src/lib/pulse/globe-engine/` — the prototype's hand-rolled canvas renderer, ported to TypeScript and stripped of all hazard knowledge; it draws `Marker`s that carry their own colour and weight. (3) `src/app/api/pulse/route.ts` + `snapshot.ts` — server-side fetch, merge, 10-minute cache, graceful degradation. (4) React components under `src/components/pulse/` — the only code that touches the engine.

**Tech Stack:** Next 16 (App Router, RSC), React 19, TypeScript strict, Tailwind v4 + `globals.css` tokens, `node:test` via `tsx` (no React test runner — none is being added).

**Spec:** `docs/superpowers/specs/2026-07-26-planet-pulse-design.md`
**Visual reference:** `prototypes/planet-pulse/index.html` (rescued Claude artifact; all line numbers in this plan refer to that file)
**Branch:** `feat/planet-pulse` (already checked out; spec + prototype committed at `968095c`)

## Global Constraints

- **TypeScript strict. No `any`** unless a documented reason sits in a comment on the line above.
- **Named exports only.** `const` over `let`. `async/await`, never `.then()` chains. Early returns.
- **No new dependencies.** Not one. The renderer is hand-rolled canvas by design — a 3D library solves a maintenance problem this project does not have.
- **Test command is `npm run test:lib`.** Tests live at `src/lib/pulse/*.test.ts` — see Task 1 for why depth matters.
- **`tsconfig.json` includes `**/*.ts`, so `next build` type-checks the test files too.** A type error in a test has blocked this repo's production build before. Run `npx tsc --noEmit` before every commit, not just `npm run test:lib`.
- **JSON fixtures import with attributes** — `import live from "./fixtures/usgs-live.json" with { type: "json" };`. Verified working under `tsx` + `resolveJsonModule` in this repo.
- **Logic gets test-first development; visuals get manual browser verification.** No claim of blanket coverage. React components are not unit-tested.
- **Every layer must have a publicly fetchable source.** `src/lib/radar/` reads the local filesystem and is therefore unusable here (that is why `/admin/radar` is `notFound()` in prod).
- **The UI can never claim freshness it does not have.** Stale data says "Snapshot" with a real timestamp; only live data says "Live". This is the exact failure of the artifact this feature was rescued from.
- **Colours come from `src/app/globals.css` tokens** where a token exists: `--color-accent: #56A077` (live/interactive), `--color-orange: #E75D31` (wildfire/high), `--color-ink: #111111`, `--color-cream: #F5EED8`, `--dur-pulse: 1500ms`.
- **Coordinates are `[lon, lat]` in both upstream feeds.** Inverting them silently plots events in the wrong hemisphere. Every normaliser test asserts the ordering.
- **Commit after every task** with a `feat:` / `test:` / `fix:` prefixed message.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/lib/pulse/types.ts` | `LayerEvent`, `Marker`, `LayerSource`, `PulseSnapshot` — the contract every layer and the engine speak |
| `src/lib/pulse/severity.ts` | USGS magnitude → 0..1 curve; category-weight fallback |
| `src/lib/pulse/normalise-eonet.ts` | EONET v3 → `LayerEvent[]` + unplottable count |
| `src/lib/pulse/normalise-usgs.ts` | USGS GeoJSON → `LayerEvent[]` + unplottable count |
| `src/lib/pulse/hazard-index.ts` | Port of `disasterScore`/`scoreBand` (lines 235–245) |
| `src/lib/pulse/merge.ts` | Great-circle distance + cross-source dedupe |
| `src/lib/pulse/layers/hazards.ts` | Layer 1: categories, colours, weights, `fetch()` |
| `src/lib/pulse/layers/registry.ts` | The one-line-per-layer list |
| `src/lib/pulse/snapshot.ts` | `buildSnapshot()` (pure) + `getPulseSnapshot()` (IO) |
| `src/lib/pulse/fixtures/*.json` | Committed fixtures — tests never hit the network |
| `src/lib/pulse/globe-engine/math.ts` | Pure quaternion + projection maths (ported) |
| `src/lib/pulse/globe-engine/engine.ts` | `GlobeEngine` class — knows markers, never hazards |
| `src/lib/pulse/globe-engine/textures.ts` | Texture load + hillshade bake, module-cached |
| `src/app/api/pulse/route.ts` | Cached JSON endpoint |
| `src/app/pulse/page.tsx` | Server component: snapshot → client tree |
| `src/components/pulse/pulse-globe.tsx` | The **only** component that touches the engine |
| `src/components/pulse/pulse-client.tsx` | Filter/selection state owner |
| `src/components/pulse/layer-panel.tsx` | Grouped category toggles |
| `src/components/pulse/event-console.tsx` | Real `<button>` list — keyboard-operable |
| `src/components/pulse/detail-panel.tsx` | Selected-event detail |
| `src/components/pulse/hazard-index.tsx` | Score gauge + band |
| `src/components/pulse/pulse-teaser.tsx` | Homepage widget |
| `scripts/extract-pulse-textures.mjs` | One-shot base64 → `public/pulse/` extraction |
| `public/pulse/{day.jpg,topo.png,clouds.png}` | Extracted textures |

**Modified:** `package.json` (test glob), `src/components/nav.tsx` (PULSE entry), `src/app/page.tsx` (teaser), `src/app/globals.css` (`.pulse-*` block).

---

### Task 1: Fix the test glob so `src/lib/pulse/` tests actually run

`npm run test:lib` runs `node --import tsx --test src/lib/**/*.test.ts`. npm executes scripts through `sh`, which does **not** support `**` — it expands to exactly one directory level. Two existing test files at `src/lib/*.test.ts` have therefore never run in the suite, and `src/lib/pulse/layers/*.test.ts` would not run either. Quoting the glob hands it to Node, which globs recursively.

Verified before writing this plan: unquoted = 43 tests, quoted = 52 tests, all passing.

**Files:**
- Modify: `package.json:9`

- [ ] **Step 1: Confirm the bug**

```bash
sh -c 'echo src/lib/**/*.test.ts'
```
Expected: a list containing `src/lib/radar/ticker.test.ts` but **not** `src/lib/strip-leading-h1.test.ts`.

- [ ] **Step 2: Record the current pass count**

```bash
npm run test:lib 2>&1 | grep "^ℹ pass"
```
Expected: `ℹ pass 43`

- [ ] **Step 3: Quote the glob**

In `package.json`, change:

```json
"test:lib": "node --import tsx --test src/lib/**/*.test.ts"
```

to:

```json
"test:lib": "node --import tsx --test \"src/lib/**/*.test.ts\""
```

- [ ] **Step 4: Verify the orphaned tests are recovered**

```bash
npm run test:lib 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `ℹ pass 52` and `ℹ fail 0`. If any of the 9 recovered tests fail, stop and fix them before continuing — they are real regressions that were hidden.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "fix: run every lib test, not just one directory deep"
```

---

### Task 2: Event contract + severity curve

**Files:**
- Create: `src/lib/pulse/types.ts`
- Create: `src/lib/pulse/severity.ts`
- Test: `src/lib/pulse/severity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `LayerEvent`, `Marker`, `CategoryMeta`, `LayerIndex`, `LayerFetchResult`, `LayerSource`, `PulseSnapshot`, `PulseLayerSummary` (all from `types.ts`); `severityFromMagnitude(mag: number): number` and `severityFromWeight(weight: number): number` (from `severity.ts`).

**Note on a deliberate deviation from the spec:** the spec's `LayerSource.fetch()` returns `Promise<LayerEvent[]>`. It returns `Promise<LayerFetchResult>` here instead, because the spec also requires "41 events, 3 unplottable" to be *visible, not silent* — the count has to survive the trip from the normaliser to the HUD, and a bare array cannot carry it.

- [ ] **Step 1: Write the contract**

Create `src/lib/pulse/types.ts`:

```ts
/** One normalised event. Every layer, present and future, produces this shape. */
export interface LayerEvent {
  id: string;          // "eonet:EONET_6789" | "usgs:us7000t3g4"
  layer: string;       // "hazards"
  category: string;    // key into that layer's categories map
  title: string;
  lat: number;
  lon: number;
  date: string;        // ISO 8601
  severity: number;    // 0..1
  magnitude?: string;  // display only: "5.3 M", "35 kts"
  source: string;      // "EONET" | "USGS"
  url?: string;        // authoritative source page
}

/** What the renderer is allowed to know. No hazard concepts cross this line. */
export interface Marker {
  id: string;
  lat: number;
  lon: number;
  color: string;
  weight: number;      // 0..1 — drives spike height and dot radius
}

export interface CategoryMeta {
  label: string;
  color: string;
  weight: number;
}

export interface LayerIndex {
  score: number;       // 0..100
  band: string;
  color: string;
}

export interface LayerFetchResult {
  events: LayerEvent[];
  /** Events dropped because their geometry was unusable. Surfaced, never silent. */
  unplottable: number;
}

export interface LayerSource {
  id: string;
  label: string;
  categories: Record<string, CategoryMeta>;
  fetch(): Promise<LayerFetchResult>;
  index?(events: LayerEvent[]): LayerIndex;
}

export interface PulseLayerSummary {
  id: string;
  label: string;
  categories: Record<string, CategoryMeta>;
  /** false when this layer's fetch rejected — the HUD says which sources are live. */
  live: boolean;
  index: LayerIndex | null;
}

export interface PulseSnapshot {
  generatedAt: string;   // ISO 8601 — the real time this data was fetched
  stale: boolean;        // true = served from last-good cache; HUD must say "Snapshot"
  events: LayerEvent[];
  unplottable: number;
  layers: PulseLayerSummary[];
}
```

- [ ] **Step 2: Write the failing severity test**

Create `src/lib/pulse/severity.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { severityFromMagnitude, severityFromWeight } from "./severity";

test("maps the bottom of the USGS feed's range to 0.3", () => {
  assert.equal(severityFromMagnitude(4.5), 0.3);
});

test("maps magnitude 7.0 to the top of the scale", () => {
  assert.equal(severityFromMagnitude(7), 1);
});

test("interpolates linearly between the two anchors", () => {
  assert.equal(Number(severityFromMagnitude(5.75).toFixed(4)), 0.65);
});

test("clamps below the lower anchor rather than returning a negative severity", () => {
  assert.equal(severityFromMagnitude(2.1), 0.3);
});

test("clamps above the upper anchor rather than exceeding 1", () => {
  assert.equal(severityFromMagnitude(9.4), 1);
});

test("treats a non-finite magnitude as the lower anchor", () => {
  assert.equal(severityFromMagnitude(Number.NaN), 0.3);
});

test("falls back to the category weight when a source reports no usable magnitude", () => {
  assert.equal(severityFromWeight(0.7), 0.7);
});

test("clamps a category weight above 1 into range", () => {
  assert.equal(severityFromWeight(1.15), 1);
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npm run test:lib 2>&1 | grep -E "severity|Cannot find"
```
Expected: FAIL — `Cannot find module './severity'`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/pulse/severity.ts`:

```ts
export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

const MAG_LO = 4.5;   // the USGS 4.5_day feed's own floor
const MAG_HI = 7;
const SEV_LO = 0.3;
const SEV_HI = 1;

/**
 * USGS magnitude → 0..1. Anchored at 4.5 → 0.3 and 7.0 → 1.0 because the feed
 * we consume starts at 4.5, so a 4.5 must not render as "nothing happened".
 */
export const severityFromMagnitude = (mag: number): number => {
  if (!Number.isFinite(mag)) return SEV_LO;
  const t = (mag - MAG_LO) / (MAG_HI - MAG_LO);
  return clamp(SEV_LO + t * (SEV_HI - SEV_LO), SEV_LO, SEV_HI);
};

/**
 * EONET reports magnitude in mutually incompatible units (kts for storms, MW
 * for fires) and often omits it. Those events take their category's weight.
 */
export const severityFromWeight = (weight: number): number => clamp(weight, 0, 1);
```

- [ ] **Step 5: Run it and watch it pass**

```bash
npm run test:lib 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `ℹ fail 0`, pass count up by 8 (60).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pulse/types.ts src/lib/pulse/severity.ts src/lib/pulse/severity.test.ts
git commit -m "feat: Planet Pulse event contract + severity curve"
```

---

### Task 3: EONET normaliser

Three shape traps, each one an actual defect if missed. Every one gets a test.

**Files:**
- Create: `src/lib/pulse/fixtures/eonet-traps.json`
- Create: `src/lib/pulse/fixtures/eonet-live.json` (captured, not hand-written)
- Create: `src/lib/pulse/normalise-eonet.ts`
- Test: `src/lib/pulse/normalise-eonet.test.ts`

**Interfaces:**
- Consumes: `LayerEvent`, `LayerFetchResult` from `./types`; `severityFromWeight` from `./severity`; `HAZARD_CATEGORIES` is *not* consumed — the mapping table lives in this file and is exported for the layer to reuse.
- Produces: `normaliseEonet(raw: unknown, categoryWeights: Record<string, number>): LayerFetchResult`, `EONET_CATEGORY_MAP: Record<string, string>`, `centroidOf(coords: number[][][]): [number, number]`.

- [ ] **Step 1: Capture a live fixture**

```bash
mkdir -p src/lib/pulse/fixtures
curl -s "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7" \
  -o src/lib/pulse/fixtures/eonet-live.json
node -e "const d=require('./src/lib/pulse/fixtures/eonet-live.json'); console.log(d.events.length, 'events;', [...new Set(d.events.flatMap(e=>e.categories.map(c=>c.id)))].join(','))"
```
Expected: a non-zero event count and a list of camelCase plural category ids. If the request fails, the feed is down — retry later; do **not** hand-write this fixture, its job is to be real.

- [ ] **Step 2: Hand-author the trap fixture**

Live data may not contain a `Polygon` or an unmapped category on any given day, so the traps get a deterministic fixture. Create `src/lib/pulse/fixtures/eonet-traps.json`:

```json
{
  "title": "EONET Events",
  "events": [
    {
      "id": "EONET_6001",
      "title": "Wildfire - Attica, Greece",
      "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_6001",
      "categories": [{ "id": "wildfires", "title": "Wildfires" }],
      "sources": [{ "id": "InciWeb", "url": "https://example.test/fire" }],
      "geometry": [
        {
          "magnitudeValue": 610,
          "magnitudeUnit": "MW",
          "date": "2026-07-26T05:00:00Z",
          "type": "Point",
          "coordinates": [23.9, 38.1]
        }
      ]
    },
    {
      "id": "EONET_6002",
      "title": "Typhoon Hinnamnor",
      "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_6002",
      "categories": [{ "id": "severeStorms", "title": "Severe Storms" }],
      "sources": [],
      "geometry": [
        { "date": "2026-07-22T00:00:00Z", "type": "Point", "coordinates": [140.2, 18.4] },
        { "date": "2026-07-25T18:00:00Z", "type": "Point", "coordinates": [128.7, 26.9] },
        { "date": "2026-07-24T06:00:00Z", "type": "Point", "coordinates": [133.1, 22.5] }
      ]
    },
    {
      "id": "EONET_6003",
      "title": "Wildfire - Perimeter, Alberta",
      "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_6003",
      "categories": [{ "id": "wildfires", "title": "Wildfires" }],
      "sources": [],
      "geometry": [
        {
          "date": "2026-07-26T02:00:00Z",
          "type": "Polygon",
          "coordinates": [[[-114, 54], [-112, 54], [-112, 56], [-114, 56], [-114, 54]]]
        }
      ]
    },
    {
      "id": "EONET_6004",
      "title": "Temperature Extreme - Sahel",
      "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_6004",
      "categories": [{ "id": "tempExtremes", "title": "Temperature Extremes" }],
      "sources": [],
      "geometry": [
        { "date": "2026-07-25T12:00:00Z", "type": "Point", "coordinates": [8.4, 15.2] }
      ]
    },
    {
      "id": "EONET_6005",
      "title": "Broken Event - No Geometry",
      "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_6005",
      "categories": [{ "id": "floods", "title": "Floods" }],
      "sources": [],
      "geometry": []
    }
  ]
}
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/pulse/normalise-eonet.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseEonet } from "./normalise-eonet";
import traps from "./fixtures/eonet-traps.json" with { type: "json" };
import live from "./fixtures/eonet-live.json" with { type: "json" };

const WEIGHTS: Record<string, number> = {
  wildfire: 1, volcano: 1.05, earthquake: 1.15, severeStorm: 1.15,
  flood: 1, drought: 0.7, landslide: 0.85, seaLakeIce: 0.45,
  dustHaze: 0.55, other: 0.6,
};

const byId = (id: string) => {
  const { events } = normaliseEonet(traps, WEIGHTS);
  const found = events.find((e) => e.id === id);
  assert.ok(found, `expected ${id} in normalised output`);
  return found;
};

test("maps EONET's camelCase plural category id to our singular key", () => {
  assert.equal(byId("eonet:EONET_6001").category, "wildfire");
  assert.equal(byId("eonet:EONET_6002").category, "severeStorm");
});

test("reads coordinates as [lon, lat], not [lat, lon]", () => {
  const fire = byId("eonet:EONET_6001");
  assert.equal(fire.lon, 23.9);
  assert.equal(fire.lat, 38.1);
});

test("plots a storm at its latest track point, not its first", () => {
  const storm = byId("eonet:EONET_6002");
  assert.equal(storm.lon, 128.7);
  assert.equal(storm.lat, 26.9);
  assert.equal(storm.date, "2026-07-25T18:00:00.000Z");
});

test("reduces a Polygon perimeter to its centroid", () => {
  const perimeter = byId("eonet:EONET_6003");
  assert.equal(perimeter.lon, -113);
  assert.equal(perimeter.lat, 55);
});

test("files an unmapped category under other rather than dropping the event", () => {
  assert.equal(byId("eonet:EONET_6004").category, "other");
});

test("drops an event with no usable geometry and counts it", () => {
  const { events, unplottable } = normaliseEonet(traps, WEIGHTS);
  assert.equal(events.some((e) => e.id === "eonet:EONET_6005"), false);
  assert.equal(unplottable, 1);
});

test("takes severity from the category weight, since EONET magnitude units are incompatible", () => {
  assert.equal(byId("eonet:EONET_6001").severity, 1);
  assert.equal(byId("eonet:EONET_6004").severity, 0.6);
});

test("formats magnitude for display only, when the feed supplies one", () => {
  assert.equal(byId("eonet:EONET_6001").magnitude, "610 MW");
  assert.equal(byId("eonet:EONET_6002").magnitude, undefined);
});

test("prefers the source's own page over the API link", () => {
  assert.equal(byId("eonet:EONET_6001").url, "https://example.test/fire");
  assert.equal(byId("eonet:EONET_6002").url, "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_6002");
});

test("survives the real live feed with every event plottable or counted", () => {
  const { events, unplottable } = normaliseEonet(live, WEIGHTS);
  assert.equal(events.length + unplottable, live.events.length);
  for (const e of events) {
    assert.ok(Number.isFinite(e.lat) && e.lat >= -90 && e.lat <= 90, `bad lat on ${e.id}`);
    assert.ok(Number.isFinite(e.lon) && e.lon >= -180 && e.lon <= 180, `bad lon on ${e.id}`);
    assert.ok(e.severity > 0 && e.severity <= 1, `bad severity on ${e.id}`);
  }
});

test("returns an empty result rather than throwing on a malformed payload", () => {
  assert.deepEqual(normaliseEonet({ nope: true }, WEIGHTS), { events: [], unplottable: 0 });
  assert.deepEqual(normaliseEonet(null, WEIGHTS), { events: [], unplottable: 0 });
});
```

- [ ] **Step 4: Run it and watch it fail**

```bash
npm run test:lib 2>&1 | grep -E "normalise-eonet|Cannot find"
```
Expected: FAIL — `Cannot find module './normalise-eonet'`.

- [ ] **Step 5: Write the implementation**

Create `src/lib/pulse/normalise-eonet.ts`:

```ts
import type { LayerEvent, LayerFetchResult } from "./types";
import { severityFromWeight } from "./severity";

/**
 * EONET v3 category ids are camelCase and plural; our canonical keys are
 * singular. This is an explicit table rather than de-pluralising strings,
 * because "seaLakeIce" and "dustHaze" have no plural to strip and a silent
 * mismatch would file real events under "other".
 */
export const EONET_CATEGORY_MAP: Record<string, string> = {
  wildfires: "wildfire",
  volcanoes: "volcano",
  earthquakes: "earthquake",
  severeStorms: "severeStorm",
  floods: "flood",
  drought: "drought",
  landslides: "landslide",
  seaLakeIce: "seaLakeIce",
  dustHaze: "dustHaze",
};

interface RawGeometry {
  date?: string;
  type?: string;
  coordinates?: unknown;
  magnitudeValue?: number;
  magnitudeUnit?: string;
}

interface RawEvent {
  id?: string;
  title?: string;
  link?: string;
  categories?: { id?: string }[];
  sources?: { url?: string }[];
  geometry?: RawGeometry[];
}

/** Mean of a polygon's outer ring, ignoring the repeated closing vertex. */
export const centroidOf = (ring: number[][]): [number, number] => {
  const pts = ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  const sum = pts.reduce<[number, number]>(
    (acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat],
    [0, 0]
  );
  return [sum[0] / pts.length, sum[1] / pts.length];
};

const pointFrom = (g: RawGeometry): [number, number] | null => {
  const c = g.coordinates;
  if (!Array.isArray(c)) return null;
  if (g.type === "Polygon") {
    const ring = c[0];
    if (!Array.isArray(ring) || ring.length === 0) return null;
    return centroidOf(ring as number[][]);
  }
  if (typeof c[0] !== "number" || typeof c[1] !== "number") return null;
  return [c[0], c[1]];
};

/** A track carries every observation. Take the latest, or storms plot days stale. */
const latestGeometry = (geometry: RawGeometry[]): RawGeometry | null => {
  const dated = geometry.filter((g) => typeof g.date === "string");
  if (dated.length === 0) return geometry[0] ?? null;
  return dated.reduce((a, b) =>
    Date.parse(b.date as string) > Date.parse(a.date as string) ? b : a
  );
};

export const normaliseEonet = (
  raw: unknown,
  categoryWeights: Record<string, number>
): LayerFetchResult => {
  const payload = raw as { events?: RawEvent[] } | null;
  const rawEvents = payload?.events;
  if (!Array.isArray(rawEvents)) return { events: [], unplottable: 0 };

  const events: LayerEvent[] = [];
  let unplottable = 0;

  for (const ev of rawEvents) {
    const geometry = Array.isArray(ev.geometry) ? ev.geometry : [];
    const latest = geometry.length > 0 ? latestGeometry(geometry) : null;
    const point = latest ? pointFrom(latest) : null;

    if (!ev.id || !latest || !point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      unplottable += 1;
      continue;
    }

    const rawCategory = ev.categories?.[0]?.id ?? "";
    const category = EONET_CATEGORY_MAP[rawCategory] ?? "other";
    const magnitude =
      typeof latest.magnitudeValue === "number" && latest.magnitudeUnit
        ? `${latest.magnitudeValue} ${latest.magnitudeUnit}`
        : undefined;

    events.push({
      id: `eonet:${ev.id}`,
      layer: "hazards",
      category,
      title: ev.title ?? "Untitled event",
      lon: point[0],
      lat: point[1],
      date: new Date(latest.date ?? Date.now()).toISOString(),
      severity: severityFromWeight(categoryWeights[category] ?? 0.6),
      magnitude,
      source: "EONET",
      url: ev.sources?.[0]?.url ?? ev.link,
    });
  }

  return { events, unplottable };
};
```

- [ ] **Step 6: Run it and watch it pass**

```bash
npm run test:lib 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `ℹ fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pulse/normalise-eonet.ts src/lib/pulse/normalise-eonet.test.ts src/lib/pulse/fixtures
git commit -m "feat: normalise EONET events (camelCase ids, track points, polygon centroids)"
```

---

### Task 4: USGS normaliser

**Files:**
- Create: `src/lib/pulse/fixtures/usgs-live.json` (captured)
- Create: `src/lib/pulse/normalise-usgs.ts`
- Test: `src/lib/pulse/normalise-usgs.test.ts`

**Interfaces:**
- Consumes: `LayerEvent`, `LayerFetchResult` from `./types`; `severityFromMagnitude` from `./severity`.
- Produces: `normaliseUsgs(raw: unknown): LayerFetchResult`.

- [ ] **Step 1: Capture the live fixture**

```bash
curl -s "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson" \
  -o src/lib/pulse/fixtures/usgs-live.json
node -e "const d=require('./src/lib/pulse/fixtures/usgs-live.json'); console.log(d.features.length,'quakes')"
```
Expected: a feature count (often 5–30; zero is possible on a quiet day — if zero, the live assertions below still pass, they are written to tolerate an empty feed).

- [ ] **Step 2: Write the failing test**

Create `src/lib/pulse/normalise-usgs.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseUsgs } from "./normalise-usgs";
import live from "./fixtures/usgs-live.json" with { type: "json" };

const FIXED = {
  features: [
    {
      id: "us7000t3g4",
      properties: {
        mag: 5.3,
        place: "112 km SSW of Tual, Indonesia",
        time: 1785000000000,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000t3g4",
      },
      geometry: { type: "Point", coordinates: [132.4, -6.7, 45.2] },
    },
    {
      id: "us7000broken",
      properties: { mag: 6.1, place: "Nowhere", time: 1785000000000, url: "" },
      geometry: null,
    },
  ],
};

test("reads coordinates as [lon, lat, depth] — inverting them plots the wrong hemisphere", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(events[0].lon, 132.4);
  assert.equal(events[0].lat, -6.7);
});

test("converts epoch milliseconds to an ISO timestamp", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(events[0].date, new Date(1785000000000).toISOString());
});

test("namespaces the id so it can never collide with an EONET id", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(events[0].id, "usgs:us7000t3g4");
});

test("files every quake under the earthquake category", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(events[0].category, "earthquake");
  assert.equal(events[0].source, "USGS");
});

test("derives severity from magnitude", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(Number(events[0].severity.toFixed(4)), 0.524);
});

test("shows magnitude with a unit suffix", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(events[0].magnitude, "5.3 M");
});

test("uses the place description as the title", () => {
  const { events } = normaliseUsgs(FIXED);
  assert.equal(events[0].title, "112 km SSW of Tual, Indonesia");
});

test("drops a feature with no geometry and counts it", () => {
  const { events, unplottable } = normaliseUsgs(FIXED);
  assert.equal(events.length, 1);
  assert.equal(unplottable, 1);
});

test("survives the real live feed", () => {
  const { events, unplottable } = normaliseUsgs(live);
  assert.equal(events.length + unplottable, live.features.length);
  for (const e of events) {
    assert.ok(e.lat >= -90 && e.lat <= 90, `bad lat on ${e.id}`);
    assert.ok(e.lon >= -180 && e.lon <= 180, `bad lon on ${e.id}`);
    assert.ok(e.date.endsWith("Z"), `bad date on ${e.id}`);
  }
});

test("returns an empty result rather than throwing on a malformed payload", () => {
  assert.deepEqual(normaliseUsgs({}), { events: [], unplottable: 0 });
  assert.deepEqual(normaliseUsgs(null), { events: [], unplottable: 0 });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npm run test:lib 2>&1 | grep -E "normalise-usgs|Cannot find"
```
Expected: FAIL — `Cannot find module './normalise-usgs'`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/pulse/normalise-usgs.ts`:

```ts
import type { LayerEvent, LayerFetchResult } from "./types";
import { severityFromMagnitude } from "./severity";

interface RawFeature {
  id?: string;
  properties?: { mag?: number; place?: string; time?: number; url?: string };
  geometry?: { coordinates?: unknown } | null;
}

export const normaliseUsgs = (raw: unknown): LayerFetchResult => {
  const payload = raw as { features?: RawFeature[] } | null;
  const features = payload?.features;
  if (!Array.isArray(features)) return { events: [], unplottable: 0 };

  const events: LayerEvent[] = [];
  let unplottable = 0;

  for (const f of features) {
    // GeoJSON order is [lon, lat, depth]. Reading it as [lat, lon] silently
    // plots every quake in the wrong hemisphere — hence the explicit indices.
    const c = f.geometry?.coordinates;
    const lon = Array.isArray(c) ? c[0] : undefined;
    const lat = Array.isArray(c) ? c[1] : undefined;

    if (!f.id || typeof lon !== "number" || typeof lat !== "number") {
      unplottable += 1;
      continue;
    }

    const mag = f.properties?.mag;
    events.push({
      id: `usgs:${f.id}`,
      layer: "hazards",
      category: "earthquake",
      title: f.properties?.place ?? "Earthquake",
      lon,
      lat,
      date: new Date(f.properties?.time ?? Date.now()).toISOString(),
      severity: severityFromMagnitude(typeof mag === "number" ? mag : Number.NaN),
      magnitude: typeof mag === "number" ? `${mag} M` : undefined,
      source: "USGS",
      url: f.properties?.url || undefined,
    });
  }

  return { events, unplottable };
};
```

- [ ] **Step 5: Run it and watch it pass**

```bash
npm run test:lib 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pulse/normalise-usgs.ts src/lib/pulse/normalise-usgs.test.ts src/lib/pulse/fixtures/usgs-live.json
git commit -m "feat: normalise USGS quakes ([lon,lat,depth] ordering, epoch to ISO)"
```

---

### Task 5: Hazard index

Port of `disasterScore` + `scoreBand` (prototype lines 235–245), with band colours rebound to site tokens: Calm → `#56A077` (Synaptic Green, the site's live/positive colour, replacing the prototype's `#43e0a0`), Elevated → `#FFD60A`, High → `#E75D31` (Cortex Orange, replacing `#ff5a1f`), Severe → `#FF2D55`.

**Files:**
- Create: `src/lib/pulse/hazard-index.ts`
- Test: `src/lib/pulse/hazard-index.test.ts`

**Interfaces:**
- Consumes: `LayerEvent`, `LayerIndex` from `./types`; `clamp` from `./severity`.
- Produces: `hazardIndex(events: LayerEvent[], weights: Record<string, number>): LayerIndex`, `scoreBand(score: number): { band: string; color: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pulse/hazard-index.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hazardIndex, scoreBand } from "./hazard-index";
import type { LayerEvent } from "./types";

const WEIGHTS: Record<string, number> = { wildfire: 1, earthquake: 1.15, drought: 0.7, other: 0.6 };

const ev = (n: number, severity: number, category = "wildfire"): LayerEvent => ({
  id: `e${n}`, layer: "hazards", category, title: `Event ${n}`,
  lat: 0, lon: 0, date: "2026-07-30T00:00:00.000Z", severity, source: "EONET",
});

test("scores an empty world as zero and calm", () => {
  const idx = hazardIndex([], WEIGHTS);
  assert.equal(idx.score, 0);
  assert.equal(idx.band, "Calm");
});

test("scores a handful of low-severity events as calm", () => {
  const idx = hazardIndex([ev(1, 0.2), ev(2, 0.25), ev(3, 0.15)], WEIGHTS);
  assert.ok(idx.score < 25, `expected < 25, got ${idx.score}`);
  assert.equal(idx.band, "Calm");
});

test("scores a world full of extreme events near the top of the scale", () => {
  const many = Array.from({ length: 40 }, (_, i) => ev(i, 1, "earthquake"));
  const idx = hazardIndex(many, WEIGHTS);
  assert.ok(idx.score >= 75, `expected >= 75, got ${idx.score}`);
  assert.equal(idx.band, "Severe");
});

test("weights an earthquake above a drought at identical severity", () => {
  const quakes = hazardIndex(Array.from({ length: 12 }, (_, i) => ev(i, 0.8, "earthquake")), WEIGHTS);
  const droughts = hazardIndex(Array.from({ length: 12 }, (_, i) => ev(i, 0.8, "drought")), WEIGHTS);
  assert.ok(quakes.score > droughts.score);
});

test("counts breadth — many moderate events outscore a single extreme one", () => {
  const one = hazardIndex([ev(1, 1)], WEIGHTS);
  const many = hazardIndex(Array.from({ length: 25 }, (_, i) => ev(i, 0.7)), WEIGHTS);
  assert.ok(many.score > one.score);
});

test("falls back to a default weight for an unknown category", () => {
  const idx = hazardIndex([ev(1, 1, "notARealCategory")], WEIGHTS);
  assert.ok(idx.score > 0);
});

test("bands on the documented thresholds", () => {
  assert.equal(scoreBand(0).band, "Calm");
  assert.equal(scoreBand(24).band, "Calm");
  assert.equal(scoreBand(25).band, "Elevated");
  assert.equal(scoreBand(49).band, "Elevated");
  assert.equal(scoreBand(50).band, "High");
  assert.equal(scoreBand(74).band, "High");
  assert.equal(scoreBand(75).band, "Severe");
  assert.equal(scoreBand(100).band, "Severe");
});

test("uses site tokens for the calm and high bands", () => {
  assert.equal(scoreBand(10).color, "#56A077");
  assert.equal(scoreBand(60).color, "#E75D31");
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run test:lib 2>&1 | grep -E "hazard-index|Cannot find"
```
Expected: FAIL — `Cannot find module './hazard-index'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/pulse/hazard-index.ts`:

```ts
import type { LayerEvent, LayerIndex } from "./types";
import { clamp } from "./severity";

const DEFAULT_WEIGHT = 0.6;
const MAX_WEIGHT = 1.15;      // the heaviest category weight — normalises intensity to 0..1
const TOP_N = 10;             // the ten worst events set the intensity term
const BREADTH_SCALE = 14;     // events above 0.5 needed before breadth saturates
const SIGNIFICANT = 0.5;

/** Ported from the prototype (lines 235–245); band colours rebound to site tokens. */
export const scoreBand = (score: number): { band: string; color: string } => {
  if (score >= 75) return { band: "Severe", color: "#FF2D55" };
  if (score >= 50) return { band: "High", color: "#E75D31" };
  if (score >= 25) return { band: "Elevated", color: "#FFD60A" };
  return { band: "Calm", color: "#56A077" };
};

/**
 * Two terms: intensity (how bad the worst ten are) and breadth (how many
 * significant events there are at all), weighted 62/38. One catastrophic
 * wildfire should not read the same as a planet on fire everywhere.
 */
export const hazardIndex = (
  events: LayerEvent[],
  weights: Record<string, number>
): LayerIndex => {
  if (events.length === 0) return { score: 0, ...scoreBand(0) };

  const weighted = events
    .map((e) => clamp(e.severity, 0, 1) * (weights[e.category] ?? DEFAULT_WEIGHT))
    .sort((a, b) => b - a);

  const top = weighted.slice(0, TOP_N);
  const intensity = top.reduce((a, b) => a + b, 0) / top.length / MAX_WEIGHT;
  const significant = weighted.filter((x) => x > SIGNIFICANT).length;
  const breadth = 1 - Math.exp(-significant / BREADTH_SCALE);
  const score = Math.round(100 * clamp(0.62 * intensity + 0.38 * breadth, 0, 1));

  return { score, ...scoreBand(score) };
};
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npm run test:lib 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pulse/hazard-index.ts src/lib/pulse/hazard-index.test.ts
git commit -m "feat: global hazard index with site-token bands"
```

---

### Task 6: Cross-source merge and dedupe

A significant earthquake appears in **both** EONET and USGS. Without dedupe it renders as two markers a few kilometres apart.

Rule, stated so it is testable: two events collapse when they share a **category** and are within **50 km** great-circle distance and within **2 hours** of each other. The USGS record wins — it carries a precise magnitude. These are initial values; the test asserts the *rule*, not a tuned constant.

**Files:**
- Create: `src/lib/pulse/merge.ts`
- Test: `src/lib/pulse/merge.test.ts`

**Interfaces:**
- Consumes: `LayerEvent` from `./types`.
- Produces: `mergeLayers(groups: LayerEvent[][]): LayerEvent[]`, `distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number`, `DEDUPE_KM`, `DEDUPE_HOURS`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pulse/merge.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLayers, distanceKm } from "./merge";
import type { LayerEvent } from "./types";

const quake = (over: Partial<LayerEvent>): LayerEvent => ({
  id: "eonet:EONET_1", layer: "hazards", category: "earthquake",
  title: "M 6.1 - Banda Sea", lat: -6.7, lon: 132.4,
  date: "2026-07-30T10:00:00.000Z", severity: 0.9, source: "EONET", ...over,
});

test("measures great-circle distance to within a kilometre", () => {
  // London to Paris is ~344 km.
  const d = distanceKm(51.5074, -0.1278, 48.8566, 2.3522);
  assert.ok(d > 335 && d < 350, `expected ~344 km, got ${d}`);
});

test("returns zero distance for the same point", () => {
  assert.equal(Math.round(distanceKm(10, 20, 10, 20)), 0);
});

test("collapses the same quake reported by both sources", () => {
  const merged = mergeLayers([
    [quake({})],
    [quake({ id: "usgs:us7000t3g4", source: "USGS", magnitude: "6.1 M", lat: -6.72, lon: 132.43 })],
  ]);
  assert.equal(merged.length, 1);
});

test("keeps the USGS record, because it carries a precise magnitude", () => {
  const merged = mergeLayers([
    [quake({})],
    [quake({ id: "usgs:us7000t3g4", source: "USGS", magnitude: "6.1 M", lat: -6.72, lon: 132.43 })],
  ]);
  assert.equal(merged[0].source, "USGS");
  assert.equal(merged[0].magnitude, "6.1 M");
});

test("keeps two events of different categories at the same spot and time", () => {
  const merged = mergeLayers([
    [quake({})],
    [quake({ id: "usgs:x", category: "volcano", source: "USGS" })],
  ]);
  assert.equal(merged.length, 2);
});

test("keeps two events further apart than the distance threshold", () => {
  // ~600 km of longitude at this latitude — well outside 50 km.
  const merged = mergeLayers([
    [quake({})],
    [quake({ id: "usgs:x", source: "USGS", lon: 138.4 })],
  ]);
  assert.equal(merged.length, 2);
});

test("keeps two events further apart than the time threshold", () => {
  const merged = mergeLayers([
    [quake({})],
    [quake({ id: "usgs:x", source: "USGS", date: "2026-07-30T18:00:00.000Z" })],
  ]);
  assert.equal(merged.length, 2);
});

test("returns everything untouched when there is nothing to collapse", () => {
  const merged = mergeLayers([[quake({}), quake({ id: "eonet:2", lat: 40, lon: -3 })]]);
  assert.equal(merged.length, 2);
});

test("sorts the merged output newest first", () => {
  const merged = mergeLayers([[
    quake({ id: "a", date: "2026-07-28T00:00:00.000Z", lat: 10, lon: 10 }),
    quake({ id: "b", date: "2026-07-30T00:00:00.000Z", lat: 40, lon: 40 }),
  ]]);
  assert.equal(merged[0].id, "b");
});

test("handles an empty input", () => {
  assert.deepEqual(mergeLayers([]), []);
  assert.deepEqual(mergeLayers([[], []]), []);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run test:lib 2>&1 | grep -E "merge|Cannot find"
```
Expected: FAIL — `Cannot find module './merge'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/pulse/merge.ts`:

```ts
import type { LayerEvent } from "./types";

export const DEDUPE_KM = 50;
export const DEDUPE_HOURS = 2;

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

export const distanceKm = (aLat: number, aLon: number, bLat: number, bLon: number): number => {
  const dLat = (bLat - aLat) * DEG;
  const dLon = (bLon - aLon) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** USGS wins a collapse: it is the authoritative record with a real magnitude. */
const preferred = (a: LayerEvent, b: LayerEvent): LayerEvent =>
  b.source === "USGS" && a.source !== "USGS" ? b : a;

const isDuplicate = (a: LayerEvent, b: LayerEvent): boolean => {
  if (a.category !== b.category) return false;
  const hours = Math.abs(Date.parse(a.date) - Date.parse(b.date)) / 3_600_000;
  if (hours > DEDUPE_HOURS) return false;
  return distanceKm(a.lat, a.lon, b.lat, b.lon) <= DEDUPE_KM;
};

/**
 * Flattens every layer's events into one list, collapsing cross-source
 * duplicates. Quadratic, deliberately: these feeds carry tens of events, not
 * thousands, and a spatial index would be unreadable ceremony at this size.
 */
export const mergeLayers = (groups: LayerEvent[][]): LayerEvent[] => {
  const kept: LayerEvent[] = [];

  for (const event of groups.flat()) {
    const clashAt = kept.findIndex((k) => isDuplicate(k, event));
    if (clashAt === -1) {
      kept.push(event);
      continue;
    }
    kept[clashAt] = preferred(kept[clashAt], event);
  }

  return kept.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
};
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npm run test:lib 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pulse/merge.ts src/lib/pulse/merge.test.ts
git commit -m "feat: collapse the same event reported by two sources"
```

---

### Task 7: Hazards layer + registry

The layer owns everything hazard-specific: category labels, colours, weights, and where the data comes from. Adding layer 2 later is a new file plus one line in the registry.

**Files:**
- Create: `src/lib/pulse/layers/hazards.ts`
- Create: `src/lib/pulse/layers/registry.ts`
- Test: `src/lib/pulse/layers.test.ts` — **note the path.** Tests must sit at `src/lib/pulse/*.test.ts`, one level under `src/lib`, so they are picked up regardless of which glob the runner ends up using.

**Interfaces:**
- Consumes: `LayerSource`, `LayerFetchResult`, `CategoryMeta` from `../types`; `normaliseEonet`, `normaliseUsgs`, `mergeLayers`, `hazardIndex`.
- Produces: `HAZARD_CATEGORIES: Record<string, CategoryMeta>`, `CATEGORY_ORDER: string[]`, `hazardsLayer: LayerSource`, `createHazardsLayer(fetchImpl: typeof fetch): LayerSource`, `PULSE_LAYERS: LayerSource[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pulse/layers.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHazardsLayer, HAZARD_CATEGORIES, CATEGORY_ORDER } from "./layers/hazards";
import { PULSE_LAYERS } from "./layers/registry";
import eonetTraps from "./fixtures/eonet-traps.json" with { type: "json" };

const stubFetch = (byUrl: Record<string, unknown>, fail?: string): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(byUrl).find((k) => url.includes(k));
    if (fail && url.includes(fail)) throw new Error("upstream down");
    return {
      ok: true,
      json: async () => (key ? byUrl[key] : {}),
    } as Response;
  }) as typeof fetch;

test("every ordered category has metadata, and every category is ordered", () => {
  for (const key of CATEGORY_ORDER) assert.ok(HAZARD_CATEGORIES[key], `${key} missing metadata`);
  assert.equal(CATEGORY_ORDER.length, Object.keys(HAZARD_CATEGORIES).length);
});

test("wildfire uses Cortex Orange, the site's brand token", () => {
  assert.equal(HAZARD_CATEGORIES.wildfire.color, "#E75D31");
});

test("fetches both sources and merges them into one event list", async () => {
  const layer = createHazardsLayer(stubFetch({
    eonet: eonetTraps,
    usgs: { features: [{
      id: "us1",
      properties: { mag: 5, place: "Test Sea", time: 1785000000000, url: "https://usgs.test/1" },
      geometry: { coordinates: [10, 20, 5] },
    }] },
  }));
  const { events, unplottable } = await layer.fetch();
  assert.ok(events.some((e) => e.source === "EONET"));
  assert.ok(events.some((e) => e.source === "USGS"));
  assert.equal(unplottable, 1); // the geometry-less EONET event
});

test("one dead source degrades to partial data instead of throwing", async () => {
  const layer = createHazardsLayer(stubFetch({ eonet: eonetTraps }, "usgs"));
  const { events } = await layer.fetch();
  assert.ok(events.length > 0);
  assert.equal(events.every((e) => e.source === "EONET"), true);
});

test("both sources dead yields an empty result, not a rejection", async () => {
  const layer = createHazardsLayer(stubFetch({}, "http"));
  const { events, unplottable } = await layer.fetch();
  assert.deepEqual(events, []);
  assert.equal(unplottable, 0);
});

test("the layer scores its own events", async () => {
  const layer = createHazardsLayer(stubFetch({ eonet: eonetTraps }));
  const { events } = await layer.fetch();
  const index = layer.index?.(events);
  assert.ok(index && index.score >= 0 && index.score <= 100);
  assert.ok(typeof index?.band === "string");
});

test("the registry exposes the hazards layer", () => {
  assert.equal(PULSE_LAYERS.length, 1);
  assert.equal(PULSE_LAYERS[0].id, "hazards");
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run test:lib 2>&1 | grep -E "layers|Cannot find"
```
Expected: FAIL — `Cannot find module './layers/hazards'`.

- [ ] **Step 3: Write the hazards layer**

Create `src/lib/pulse/layers/hazards.ts`:

```ts
import type { CategoryMeta, LayerFetchResult, LayerSource } from "../types";
import { normaliseEonet } from "../normalise-eonet";
import { normaliseUsgs } from "../normalise-usgs";
import { mergeLayers } from "../merge";
import { hazardIndex } from "../hazard-index";

const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7";
const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";

/** Ten minutes: EONET updates on the order of hours, and a news globe does not
 *  need per-second earthquake data. Upstream sees one request per ten minutes
 *  regardless of visitor count. */
const REVALIDATE_SECONDS = 600;

export const HAZARD_CATEGORIES: Record<string, CategoryMeta> = {
  wildfire:   { label: "Wildfire",      color: "#E75D31", weight: 1.0 },
  volcano:    { label: "Volcano",       color: "#FF2D55", weight: 1.05 },
  earthquake: { label: "Earthquake",    color: "#FFD60A", weight: 1.15 },
  severeStorm:{ label: "Severe Storm",  color: "#5AC8FA", weight: 1.15 },
  flood:      { label: "Flood",         color: "#0A84FF", weight: 1.0 },
  drought:    { label: "Drought",       color: "#C99A2E", weight: 0.7 },
  landslide:  { label: "Landslide",     color: "#BF8A5A", weight: 0.85 },
  seaLakeIce: { label: "Sea & Lake Ice", color: "#A0E9FF", weight: 0.45 },
  dustHaze:   { label: "Dust & Haze",   color: "#D9A066", weight: 0.55 },
  other:      { label: "Other",         color: "#98989D", weight: 0.6 },
};

export const CATEGORY_ORDER = [
  "wildfire", "volcano", "earthquake", "severeStorm", "flood",
  "drought", "landslide", "seaLakeIce", "dustHaze", "other",
];

const WEIGHTS = Object.fromEntries(
  Object.entries(HAZARD_CATEGORIES).map(([k, v]) => [k, v.weight])
);

const getJson = async (fetchImpl: typeof fetch, url: string): Promise<unknown> => {
  const res = await fetchImpl(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
};

/** Injectable fetch so the layer is testable without touching the network. */
export const createHazardsLayer = (fetchImpl: typeof fetch): LayerSource => ({
  id: "hazards",
  label: "Natural hazards",
  categories: HAZARD_CATEGORIES,

  async fetch(): Promise<LayerFetchResult> {
    // allSettled, not all: one dead source degrades to partial data, never a
    // blank page.
    const [eonet, usgs] = await Promise.allSettled([
      getJson(fetchImpl, EONET_URL),
      getJson(fetchImpl, USGS_URL),
    ]);

    const a = eonet.status === "fulfilled"
      ? normaliseEonet(eonet.value, WEIGHTS)
      : { events: [], unplottable: 0 };
    const b = usgs.status === "fulfilled"
      ? normaliseUsgs(usgs.value)
      : { events: [], unplottable: 0 };

    return {
      events: mergeLayers([a.events, b.events]),
      unplottable: a.unplottable + b.unplottable,
    };
  },

  index: (events) => hazardIndex(events, WEIGHTS),
});

export const hazardsLayer = createHazardsLayer(fetch);
```

- [ ] **Step 4: Write the registry**

Create `src/lib/pulse/layers/registry.ts`:

```ts
import type { LayerSource } from "../types";
import { hazardsLayer } from "./hazards";

/**
 * Only registered layers render — a public page shows no dead "coming soon"
 * rows. Adding conflict/unrest/viral later is a new file plus one line here.
 */
export const PULSE_LAYERS: LayerSource[] = [hazardsLayer];
```

- [ ] **Step 5: Run it and watch it pass**

```bash
npm run test:lib 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pulse/layers src/lib/pulse/layers.test.ts
git commit -m "feat: hazards layer + layer registry"
```

---

### Task 8: Snapshot builder + `/api/pulse`

**Why a shared `getPulseSnapshot()` rather than the page calling its own API over HTTP:** a server component fetching its own route handler costs a second network hop and a second cache entry for identical data. Both the page and the route call the same function; `fetch(..., { next: { revalidate: 600 } })` inside the layer is what actually does the caching. The route exists for the client-side refresh and for the teaser.

**Stale-cache honesty, stated plainly:** `lastGood` is module-level memory. On Vercel that is per-lambda-instance and evaporates on a cold start, so a cold instance meeting two dead sources shows the explicit empty state rather than stale data. That is acceptable and it is *not* dishonest — what must never happen is showing old data labelled "Live". Do not reach for a database to fix this.

**Files:**
- Create: `src/lib/pulse/snapshot.ts`
- Create: `src/app/api/pulse/route.ts`
- Test: `src/lib/pulse/snapshot.test.ts`

**Interfaces:**
- Consumes: `LayerSource`, `PulseSnapshot`, `LayerFetchResult` from `./types`; `PULSE_LAYERS` from `./layers/registry`.
- Produces: `buildSnapshot(layers: LayerSource[], results: PromiseSettledResult<LayerFetchResult>[], nowIso: string): PulseSnapshot`, `getPulseSnapshot(): Promise<PulseSnapshot>`, `__resetPulseCache(): void` (test-only escape hatch, documented as such).

- [ ] **Step 1: Write the failing test**

Create `src/lib/pulse/snapshot.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot } from "./snapshot";
import { createHazardsLayer } from "./layers/hazards";
import type { LayerEvent, LayerFetchResult } from "./types";

const NOW = "2026-07-30T12:00:00.000Z";
const layer = createHazardsLayer(fetch);

const ev = (id: string): LayerEvent => ({
  id, layer: "hazards", category: "wildfire", title: "Fire",
  lat: 1, lon: 2, date: NOW, severity: 0.9, source: "EONET",
});

const ok = (r: LayerFetchResult): PromiseSettledResult<LayerFetchResult> =>
  ({ status: "fulfilled", value: r });
const dead = (): PromiseSettledResult<LayerFetchResult> =>
  ({ status: "rejected", reason: new Error("down") });

test("reports the real fetch time and marks fresh data as not stale", () => {
  const snap = buildSnapshot([layer], [ok({ events: [ev("a")], unplottable: 0 })], NOW);
  assert.equal(snap.generatedAt, NOW);
  assert.equal(snap.stale, false);
});

test("carries the unplottable count through to the snapshot", () => {
  const snap = buildSnapshot([layer], [ok({ events: [ev("a")], unplottable: 3 })], NOW);
  assert.equal(snap.events.length, 1);
  assert.equal(snap.unplottable, 3);
});

test("marks a layer live when its fetch succeeded", () => {
  const snap = buildSnapshot([layer], [ok({ events: [ev("a")], unplottable: 0 })], NOW);
  assert.equal(snap.layers[0].live, true);
  assert.equal(snap.layers[0].id, "hazards");
});

test("marks a layer not live when its fetch rejected, without throwing", () => {
  const snap = buildSnapshot([layer], [dead()], NOW);
  assert.equal(snap.layers[0].live, false);
  assert.deepEqual(snap.events, []);
});

test("includes the layer's own index for the HUD", () => {
  const snap = buildSnapshot([layer], [ok({ events: [ev("a"), ev("b")], unplottable: 0 })], NOW);
  assert.ok(snap.layers[0].index);
  assert.ok((snap.layers[0].index?.score ?? -1) >= 0);
});

test("ships the category metadata so the UI never hardcodes colours", () => {
  const snap = buildSnapshot([layer], [ok({ events: [], unplottable: 0 })], NOW);
  assert.equal(snap.layers[0].categories.wildfire.color, "#E75D31");
});

test("an all-dead snapshot is empty rather than fabricated", () => {
  const snap = buildSnapshot([layer], [dead()], NOW);
  assert.equal(snap.events.length, 0);
  assert.equal(snap.stale, false); // freshly fetched nothing — not stale data
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run test:lib 2>&1 | grep -E "snapshot|Cannot find"
```
Expected: FAIL — `Cannot find module './snapshot'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/pulse/snapshot.ts`:

```ts
import type { LayerFetchResult, LayerSource, PulseSnapshot } from "./types";
import { PULSE_LAYERS } from "./layers/registry";
import { mergeLayers } from "./merge";

export const buildSnapshot = (
  layers: LayerSource[],
  results: PromiseSettledResult<LayerFetchResult>[],
  nowIso: string
): PulseSnapshot => {
  const groups = results.map((r) => (r.status === "fulfilled" ? r.value.events : []));
  const unplottable = results.reduce(
    (sum, r) => sum + (r.status === "fulfilled" ? r.value.unplottable : 0),
    0
  );

  return {
    generatedAt: nowIso,
    stale: false,
    events: mergeLayers(groups),
    unplottable,
    layers: layers.map((layer, i) => {
      const result = results[i];
      const events = result.status === "fulfilled" ? result.value.events : [];
      return {
        id: layer.id,
        label: layer.label,
        categories: layer.categories,
        live: result.status === "fulfilled",
        index: layer.index ? layer.index(events) : null,
      };
    }),
  };
};

/**
 * Last good payload, held in module memory. On Vercel this is per-instance and
 * dies with a cold start — deliberate. The rule it exists to serve is that the
 * UI never claims freshness it does not have, not that data is never lost.
 */
let lastGood: PulseSnapshot | null = null;

/** Test-only. Not called by application code. */
export const __resetPulseCache = (): void => {
  lastGood = null;
};

export const getPulseSnapshot = async (): Promise<PulseSnapshot> => {
  const results = await Promise.allSettled(PULSE_LAYERS.map((l) => l.fetch()));
  const snapshot = buildSnapshot(PULSE_LAYERS, results, new Date().toISOString());

  const everySourceDead = snapshot.layers.every((l) => !l.live);
  if (everySourceDead && lastGood) {
    return { ...lastGood, stale: true };
  }

  if (!everySourceDead) lastGood = snapshot;
  return snapshot;
};
```

- [ ] **Step 4: Write the route handler**

Create `src/app/api/pulse/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getPulseSnapshot } from "@/lib/pulse/snapshot";

export const revalidate = 600;

/**
 * Server-side so the browser never calls NASA directly: no CORS exposure, no
 * per-visitor rate-limit risk, one cached payload for all traffic.
 */
export async function GET() {
  const snapshot = await getPulseSnapshot();
  return NextResponse.json(snapshot);
}
```

- [ ] **Step 5: Run it and watch it pass**

```bash
npm run test:lib 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `ℹ fail 0`.

- [ ] **Step 6: Verify the route against the real feeds**

```bash
npm run dev &
sleep 12
curl -s http://localhost:3000/api/pulse | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);
console.log('events',p.events.length,'unplottable',p.unplottable,'stale',p.stale);
console.log('layers',p.layers.map(l=>l.id+':'+(l.live?'live':'DEAD')+':'+l.index?.score).join(' '));
const bad=p.events.filter(e=>!Number.isFinite(e.lat)||!Number.isFinite(e.lon));
console.log('bad geometry:',bad.length);})"
kill %1
```
Expected: a non-zero event count, `hazards:live:<score>`, `stale false`, `bad geometry: 0`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pulse/snapshot.ts src/lib/pulse/snapshot.test.ts src/app/api/pulse/route.ts
git commit -m "feat: cached /api/pulse snapshot with graceful source degradation"
```

---

### Task 9: Extract the textures out of base64

The prototype carries three images inline as base64: `day` (JPEG), `topo` (PNG), `clouds` (PNG) — 1.19MB of the file's 1.2MB.

**One correction to the spec.** The spec says textures move to `/public/pulse/{day,topo,clouds}.jpg`. **Clouds must stay PNG** — the renderer reads cloud density from the **alpha channel** (`cloudData[((cy*TWc+cx)<<2)+3]`, line 422). JPEG has no alpha, so a `clouds.jpg` would silently produce a cloudless planet. Topo stays PNG too (it is a small greyscale heightmap and JPEG ringing on a height field creates visible terracing in the hillshade).

Function-bundle safety: `next.config.ts` already excludes `public/**/*.jpg` and `public/**/*.png` from every serverless function trace, so these files cannot regress the 250MB limit. No config change needed — verify, don't assume.

**Files:**
- Create: `scripts/extract-pulse-textures.mjs`
- Create: `public/pulse/day.jpg`, `public/pulse/topo.png`, `public/pulse/clouds.png`

- [ ] **Step 1: Write the extraction script**

Create `scripts/extract-pulse-textures.mjs`:

```js
// One-shot: pull the three base64 textures out of the rescued prototype into
// real files. Kept in the repo so the extraction is reproducible, not folklore.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const EXT = { jpeg: "jpg", png: "png" };
const src = readFileSync("prototypes/planet-pulse/index.html", "utf8");
const re = /"(day|topo|clouds)":"data:image\/(jpeg|png);base64,([^"]+)"/g;

mkdirSync("public/pulse", { recursive: true });

let found = 0;
for (const [, name, mime, b64] of src.matchAll(re)) {
  const buf = Buffer.from(b64, "base64");
  const out = `public/pulse/${name}.${EXT[mime]}`;
  writeFileSync(out, buf);
  console.log(`${out} — ${(buf.length / 1024).toFixed(0)} KB`);
  found += 1;
}

if (found !== 3) {
  console.error(`Expected 3 textures, extracted ${found}`);
  process.exit(1);
}
```

- [ ] **Step 2: Run it**

```bash
node scripts/extract-pulse-textures.mjs
```
Expected, approximately:
```
public/pulse/day.jpg — 265 KB
public/pulse/topo.png — 165 KB
public/pulse/clouds.png — 470 KB
```

- [ ] **Step 3: Verify the images decode and clouds kept its alpha channel**

```bash
file public/pulse/day.jpg public/pulse/topo.png public/pulse/clouds.png
node -e "
const b=require('fs').readFileSync('public/pulse/clouds.png');
// PNG IHDR colour-type byte sits at offset 25; 4 or 6 means an alpha channel.
const ct=b[25];
console.log('clouds colour type', ct, ct===4||ct===6 ? 'OK (has alpha)' : 'FAIL (no alpha — clouds will not render)');
"
```
Expected: `day.jpg: JPEG image data`, both PNGs reported as PNG, and `OK (has alpha)`.

- [ ] **Step 4: Confirm they cannot bloat a function bundle**

```bash
grep -A3 'outputFileTracingExcludes' next.config.ts | grep -E "png|jpg"
```
Expected: both `public/**/*.png` and `public/**/*.jpg` present. If either is missing, add it before committing.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-pulse-textures.mjs public/pulse
git commit -m "feat: extract Planet Pulse earth textures from the prototype base64"
```

---

### Task 10: Engine maths

Pure functions, no canvas, fully testable. Ported verbatim from the prototype — the maths is correct and works; retyping it from memory would be how a bug gets introduced.

**Files:**
- Create: `src/lib/pulse/globe-engine/math.ts`
- Test: `src/lib/pulse/globe-math.test.ts` (kept at `src/lib/pulse/` depth for the glob)

**Interfaces:**
- Consumes: nothing.
- Produces: `type Vec3 = [number, number, number]`, `type Quat = [number, number, number, number]`, `type Mat3 = number[]`, and `llToVec`, `qmul`, `qaxis`, `qnorm`, `qmat`, `qFromUnit`, `qslerp`, `projectVec`.

**Port map** (source: `prototypes/planet-pulse/index.html`):

| Function | Lines | Change on port |
|---|---|---|
| `llToVec` | 250 | Types only |
| `qmul` | 256–260 | Types only |
| `qaxis` | 261 | Types only |
| `qnorm` | 262 | Types only |
| `qmat` | 263–266 | Types only |
| `qFromUnit` | 267–273 | Types only |
| `qslerp` | 274–280 | Types only |
| `project` | 434–440 | Becomes `projectVec(v, m, cx, cy, r)` — takes the matrix and viewport as arguments instead of reading module globals |

- [ ] **Step 1: Write the failing test**

Create `src/lib/pulse/globe-math.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  llToVec, qaxis, qnorm, qmul, qmat, qFromUnit, qslerp, projectVec,
} from "./globe-engine/math";

const near = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${b}, got ${a}`);

const length = (v: number[]) => Math.hypot(...v);

test("maps 0,0 to the unit vector facing the prime meridian", () => {
  const [x, y, z] = llToVec(0, 0);
  near(x, 1); near(y, 0); near(z, 0);
});

test("maps the north pole to +Y", () => {
  const [x, y, z] = llToVec(90, 0);
  near(x, 0); near(y, 1); near(z, 0);
});

test("negates Z so east stays east and the map does not mirror", () => {
  const [, , z] = llToVec(0, 90);
  near(z, -1);
});

test("always returns a unit vector", () => {
  for (const [lat, lon] of [[51.5, -0.13], [-33.9, 151.2], [35.7, 139.7]]) {
    near(length(llToVec(lat, lon)), 1, 1e-12);
  }
});

test("normalises a quaternion to unit length", () => {
  near(length(qnorm([3, 0, 0, 4])), 1, 1e-12);
});

test("normalising a zero quaternion does not divide by zero", () => {
  const q = qnorm([0, 0, 0, 0]);
  assert.ok(q.every(Number.isFinite));
});

test("multiplying by the identity quaternion changes nothing", () => {
  const q = qnorm([0.2, 0.5, 0.1, 0.8]);
  const r = qmul(q, [0, 0, 0, 1]);
  q.forEach((v, i) => near(r[i], v, 1e-12));
});

test("a quarter turn about Y sends +X to -Z", () => {
  const m = qmat(qaxis(0, 1, 0, Math.PI / 2));
  const x = m[0] * 1 + m[1] * 0 + m[2] * 0;
  const z = m[6] * 1 + m[7] * 0 + m[8] * 0;
  near(x, 0, 1e-12); near(z, -1, 1e-12);
});

test("builds the rotation that carries one unit vector onto another", () => {
  const a = llToVec(12, 40);
  const b: [number, number, number] = [0, 0, 1];
  const m = qmat(qFromUnit(a, b));
  const out = [
    m[0] * a[0] + m[1] * a[1] + m[2] * a[2],
    m[3] * a[0] + m[4] * a[1] + m[5] * a[2],
    m[6] * a[0] + m[7] * a[1] + m[8] * a[2],
  ];
  out.forEach((v, i) => near(v, b[i], 1e-9));
});

test("handles the antipodal case without producing NaN", () => {
  const q = qFromUnit([1, 0, 0], [-1, 0, 0]);
  assert.ok(q.every(Number.isFinite));
  near(length(q), 1, 1e-12);
});

test("slerp at t=0 and t=1 returns the endpoints", () => {
  const a = qnorm([0, 0, 0, 1]);
  const b = qnorm(qaxis(0, 1, 0, 1.2));
  qslerp(a, b, 0).forEach((v, i) => near(v, a[i], 1e-9));
  qslerp(a, b, 1).forEach((v, i) => near(v, b[i], 1e-9));
});

test("slerp stays on the unit sphere at the midpoint", () => {
  const a = qnorm([0, 0, 0, 1]);
  const b = qnorm(qaxis(1, 0, 0, 2.4));
  near(length(qslerp(a, b, 0.5)), 1, 1e-9);
});

test("slerp takes the short way round when the endpoints are opposed in sign", () => {
  const a = qnorm([0, 0, 0, 1]);
  const b: [number, number, number, number] = [0, 0, 0, -1];
  const mid = qslerp(a, b, 0.5);
  assert.ok(Math.abs(mid[3]) > 0.99, "should barely move — these are the same orientation");
});

test("projects the facing point to the centre of the viewport, in front", () => {
  const m = qmat([0, 0, 0, 1]);
  const [sx, sy, vz] = projectVec([0, 0, 1], m, 200, 150, 100);
  near(sx, 200); near(sy, 150);
  assert.ok(vz > 0, "should be on the near side");
});

test("reports a point on the far side of the globe as behind", () => {
  const m = qmat([0, 0, 0, 1]);
  const [, , vz] = projectVec([0, 0, -1], m, 200, 150, 100);
  assert.ok(vz < 0);
});

test("screen Y is inverted, because canvas Y grows downward", () => {
  const m = qmat([0, 0, 0, 1]);
  const [, sy] = projectVec([0, 1, 0], m, 200, 150, 100);
  near(sy, 50); // 150 - 1*100
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run test:lib 2>&1 | grep -E "globe-math|Cannot find"
```
Expected: FAIL — `Cannot find module './globe-engine/math'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/pulse/globe-engine/math.ts`:

```ts
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];   // [x, y, z, w]
export type Mat3 = number[];                           // row-major, 9 entries

const DEG = Math.PI / 180;

/**
 * Geographic → 3D unit vector. Z is NEGATED to match the standard
 * equirectangular texture convention (east is +lon); this keeps markers and
 * the map from mirroring east-west.
 */
export const llToVec = (lat: number, lon: number): Vec3 => {
  const la = lat * DEG;
  const lo = lon * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
};

export const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

export const qaxis = (x: number, y: number, z: number, ang: number): Quat => {
  const h = ang / 2;
  const s = Math.sin(h);
  return [x * s, y * s, z * s, Math.cos(h)];
};

export const qnorm = (q: Quat): Quat => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};

/** Rotation matrix (row-major) that rotates a vector by q. */
export const qmat = (q: Quat): Mat3 => {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    1 - (yy + zz), xy - wz, xz + wy,
    xy + wz, 1 - (xx + zz), yz - wx,
    xz - wy, yz + wx, 1 - (xx + yy),
  ];
};

/** The rotation carrying unit vector a onto unit vector b. */
export const qFromUnit = (a: Vec3, b: Vec3): Quat => {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) {
    // Opposite vectors: any perpendicular axis will do, but it must be a real
    // one — the cross product is zero here and would give a NaN quaternion.
    return Math.abs(a[0]) > Math.abs(a[2])
      ? qnorm([-a[1], a[0], 0, 0])
      : qnorm([0, -a[2], a[1], 0]);
  }
  return qnorm([
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
    1 + d,
  ]);
};

export const qslerp = (a: Quat, b: Quat, t: number): Quat => {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let end = b;
  if (dot < 0) {
    end = [-b[0], -b[1], -b[2], -b[3]];
    dot = -dot;
  }
  if (dot > 0.9995) {
    return qnorm([
      a[0] + (end[0] - a[0]) * t,
      a[1] + (end[1] - a[1]) * t,
      a[2] + (end[2] - a[2]) * t,
      a[3] + (end[3] - a[3]) * t,
    ]);
  }
  const th = Math.acos(dot);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [
    a[0] * wa + end[0] * wb,
    a[1] * wa + end[1] * wb,
    a[2] * wa + end[2] * wb,
    a[3] * wa + end[3] * wb,
  ];
};

/** World unit vector → [screenX, screenY, viewZ]. viewZ > 0 means front-facing. */
export const projectVec = (
  v: Vec3, m: Mat3, cx: number, cy: number, r: number
): Vec3 => {
  const vx = m[0] * v[0] + m[1] * v[1] + m[2] * v[2];
  const vy = m[3] * v[0] + m[4] * v[1] + m[5] * v[2];
  const vz = m[6] * v[0] + m[7] * v[1] + m[8] * v[2];
  return [cx + vx * r, cy - vy * r, vz];
};
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npm run test:lib 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pulse/globe-engine/math.ts src/lib/pulse/globe-math.test.ts
git commit -m "feat: port the globe's quaternion and projection maths to TypeScript"
```

---

### Task 11: `GlobeEngine`

The renderer. Framework-agnostic, canvas-only, and — the point of the whole split — **it does not know what a wildfire is**. It draws `Marker`s that arrive carrying their own colour and weight.

Visual work: verified in the browser, not by tests. That is a stated consequence of having no React/DOM test runner, not an oversight.

**Files:**
- Create: `src/lib/pulse/globe-engine/textures.ts`
- Create: `src/lib/pulse/globe-engine/engine.ts`
- Create: `src/lib/pulse/globe-engine/index.ts` (re-export)

**Interfaces:**
- Consumes: `Marker` from `../types`; everything from `./math`.
- Produces:

```ts
export interface GlobeEngineOptions {
  /** Compact mode: auto-spin, no picking, no hover, no keyboard rotation. */
  compact?: boolean;
  textures?: { day: string; topo: string; clouds: string };
}

export type GlobeEvent = "pick" | "hover";

export class GlobeEngine {
  constructor(canvas: HTMLCanvasElement, options?: GlobeEngineOptions);
  setMarkers(markers: Marker[]): void;
  setSelected(id: string | null): void;
  focus(lat: number, lon: number): void;
  setSpin(on: boolean): void;
  isSpinning(): boolean;
  resize(): void;
  on(event: "pick", cb: (id: string | null) => void): () => void;
  on(event: "hover", cb: (id: string | null, x: number, y: number) => void): () => void;
  destroy(): void;
}
```

**Port map** (source: `prototypes/planet-pulse/index.html`). Every "change" column entry is mandatory — the prototype is a full-window single-instance page script, and this is a mountable component that must be able to exist twice and be torn down.

| Prototype | Lines | Change on port |
|---|---|---|
| `loadImage` | 301–303 | Moves to `textures.ts` |
| `buildEarthTexture` | 305–342 | Moves to `textures.ts`; takes texture URLs, returns `{ earthData, cloudData }`; **result cached in a module-level promise** so a second engine instance reuses the 2048×1024 hillshade bake instead of redoing 2M pixels |
| `setSphereRes` | 356–367 | Method; unchanged maths |
| `resize` | 369–387 | **Reads the canvas's parent rect, not `innerWidth`/`innerHeight`.** This is what makes the compact teaser possible |
| `renderSphere` | 391–431 | Method; reads `this.earthData` / `this.cloudData` |
| `project` | 434–440 | Replaced by `projectVec` from `math.ts` |
| `draw` | 443–484 | Marker colour comes from `marker.color`; spike height and radius from `marker.weight` — **all `catOf`/`CATS` lookups deleted** |
| `applySpin` | 488–491 | Method |
| `tick` | 492–521 | Method; stores the rAF handle so `destroy()` can cancel it |
| `pick` | 563 | Method; emits through the listener registry rather than calling `selectEvent` |
| `focusEvent` | 565–568 | Becomes `focus(lat, lon)` — takes coordinates, not an event object |
| pointer/wheel/touch/key handlers | 534–561 | Bound in the constructor with stored references so `destroy()` removes every one; **skipped entirely in compact mode** except a single click that the host component turns into navigation |
| `stars` | 379–381 | Kept, seeded deterministically as in the prototype |
| `reduceMotion` | 291–292 | Kept: `matchMedia("(prefers-reduced-motion: reduce)")` disables spin and pulse rings |

- [ ] **Step 1: Write the texture loader**

Create `src/lib/pulse/globe-engine/textures.ts`:

```ts
export interface EarthTextures {
  earthData: Uint8ClampedArray;   // 2048×1024 RGBA, hillshade baked in
  cloudData: Uint8ClampedArray;   // 1024×512 RGBA, density in the alpha channel
}

export const TEX_W = 2048;
export const TEX_H = 1024;
export const CLOUD_W = 1024;
export const CLOUD_H = 512;

export const DEFAULT_TEXTURE_URLS = {
  day: "/pulse/day.jpg",
  topo: "/pulse/topo.png",
  clouds: "/pulse/clouds.png",   // PNG, not JPEG: density lives in the alpha channel
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`texture failed to load: ${src}`));
    im.src = src;
  });

const grab = (
  img: HTMLImageElement, w: number, h: number
): Uint8ClampedArray => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) throw new Error("2d context unavailable");
  x.drawImage(img, 0, 0, w, h);
  return x.getImageData(0, 0, w, h).data;
};

/**
 * Bake hillshade relief from the topography into the day colour, so the
 * surface reads as terrain rather than a flat plain. ~2M pixels — expensive
 * enough that the result is cached for the process, not per engine instance.
 */
const build = async (urls: typeof DEFAULT_TEXTURE_URLS): Promise<EarthTextures> => {
  const [dayImg, topoImg, cloudImg] = await Promise.all([
    loadImage(urls.day), loadImage(urls.topo), loadImage(urls.clouds),
  ]);

  const day = grab(dayImg, TEX_W, TEX_H);
  const HW = TEX_W >> 1;
  const HH = TEX_H >> 1;
  const topo = grab(topoImg, HW, HH);
  const cloudData = grab(cloudImg, CLOUD_W, CLOUD_H);

  const earthData = new Uint8ClampedArray(day.length);
  const hAt = (hx: number, hy: number) => topo[((hy * HW) + hx) << 2];
  const lx = -0.55, ly = -0.55, lz = 1.5;
  const ll = Math.hypot(lx, ly, lz);

  for (let ty = 0; ty < TEX_H; ty++) {
    const hy = ty >> 1;
    const hy0 = hy > 0 ? hy - 1 : hy;
    const hy1 = hy < HH - 1 ? hy + 1 : hy;
    for (let tx = 0; tx < TEX_W; tx++) {
      const i = (ty * TEX_W + tx) << 2;
      const hx = tx >> 1;
      const hx0 = hx > 0 ? hx - 1 : hx;
      const hx1 = hx < HW - 1 ? hx + 1 : hx;
      const sx = (hAt(hx0, hy) - hAt(hx1, hy)) * 0.05;
      const sy = (hAt(hx, hy0) - hAt(hx, hy1)) * 0.05;
      const nl = Math.hypot(sx, sy, 1);
      const sh = (sx * lx + sy * ly + lz) / (nl * ll);
      const f = 0.78 + 0.42 * Math.max(0, sh);
      earthData[i] = day[i] * f;
      earthData[i + 1] = day[i + 1] * f;
      earthData[i + 2] = day[i + 2] * f;
      earthData[i + 3] = 255;
    }
  }

  return { earthData, cloudData };
};

let cached: Promise<EarthTextures> | null = null;

export const loadEarthTextures = (
  urls: typeof DEFAULT_TEXTURE_URLS = DEFAULT_TEXTURE_URLS
): Promise<EarthTextures> => {
  cached ??= build(urls);
  return cached;
};
```

- [ ] **Step 2: Write the engine**

Create `src/lib/pulse/globe-engine/engine.ts`. Port each function per the table above. The structural parts that are **new** (and therefore given in full rather than referenced) are the lifecycle, the listener registry, the container-relative resize, and the hazard-free draw loop:

```ts
import type { Marker } from "../types";
import {
  llToVec, qaxis, qFromUnit, qmat, qmul, qnorm, qslerp, projectVec,
  type Mat3, type Quat, type Vec3,
} from "./math";
import {
  loadEarthTextures, DEFAULT_TEXTURE_URLS, TEX_W, TEX_H, CLOUD_W, CLOUD_H,
  type EarthTextures,
} from "./textures";

export interface GlobeEngineOptions {
  compact?: boolean;
  textures?: typeof DEFAULT_TEXTURE_URLS;
}

interface PlacedMarker extends Marker {
  v: Vec3;
  phase: number;
  sx: number | null;
  sy: number | null;
  sr: number;
}

type PickListener = (id: string | null) => void;
type HoverListener = (id: string | null, x: number, y: number) => void;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class GlobeEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sphereCanvas: HTMLCanvasElement;
  private readonly sctx: CanvasRenderingContext2D;
  private readonly compact: boolean;
  private readonly reduceMotion: boolean;
  private readonly cleanups: (() => void)[] = [];
  private readonly pickListeners = new Set<PickListener>();
  private readonly hoverListeners = new Set<HoverListener>();

  private markers: PlacedMarker[] = [];
  private textures: EarthTextures | null = null;
  private raf = 0;
  private destroyed = false;

  private orient: Quat = qFromUnit(llToVec(8, 22), [0, 0, 1]);  // open on Africa
  private curM: Mat3 = qmat(this.orient);
  private target: Quat | null = null;
  private focusing = false;
  private spin = true;
  private zoom = 1;
  private velX = 0;
  private velY = 0;
  private selected: string | null = null;
  private dragging = false;

  // viewport
  private W = 0; private H = 0; private DPR = 1;
  private CX = 0; private CY = 0; private R = 0;
  private stars: [number, number, number, number][] = [];

  // sphere raster
  private S = 0; private SHI = 0; private SLO = 0;
  private sphereImg: ImageData | null = null;
  private dirX: Float32Array | null = null;
  private dirY: Float32Array | null = null;
  private dirZ: Float32Array | null = null;
  private sphereDirty = true;
  private lastKey = "";
  private frameNo = 0;
  private cloudDrift = 0;

  constructor(canvas: HTMLCanvasElement, options: GlobeEngineOptions = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    const sphereCanvas = document.createElement("canvas");
    const sctx = sphereCanvas.getContext("2d");
    if (!sctx) throw new Error("2d context unavailable");

    this.canvas = canvas;
    this.ctx = ctx;
    this.sphereCanvas = sphereCanvas;
    this.sctx = sctx;
    this.compact = options.compact ?? false;
    this.reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (this.reduceMotion) this.spin = false;

    this.resize();
    this.bindEvents();

    void loadEarthTextures(options.textures).then((t) => {
      if (this.destroyed) return;
      this.textures = t;
      this.sphereDirty = true;
      this.canvas.classList.add("ready");
    });

    this.raf = requestAnimationFrame(this.tick);
  }

  /** Container-relative, NOT window-relative — this is what lets the teaser be
   *  a small box on a page that also has other content. */
  resize(): void {
    const host = this.canvas.parentElement;
    const rect = host ? host.getBoundingClientRect() : this.canvas.getBoundingClientRect();
    this.DPR = Math.min(devicePixelRatio || 1, 2);
    this.W = Math.max(1, Math.round(rect.width));
    this.H = Math.max(1, Math.round(rect.height));
    this.canvas.width = this.W * this.DPR;
    this.canvas.height = this.H * this.DPR;
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);

    const portrait = this.W / this.H < 0.95;
    this.R = Math.min(this.W, this.H) * (portrait ? 0.42 : 0.4) * this.zoom;
    this.CX = this.W / 2;
    this.CY = this.H / 2 + (portrait && !this.compact ? this.H * 0.14 : 0);

    this.stars = [];
    const n = Math.round((this.W * this.H) / 9000);
    let seed = 20260726;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < n; i++) {
      this.stars.push([rnd() * this.W, rnd() * this.H, rnd() * 1.4 + 0.2, rnd()]);
    }

    this.SHI = clamp(Math.round(2 * this.R), 96, 460);
    this.SLO = clamp(Math.round(1.7 * this.R), 96, 360);
    this.setSphereRes(this.SHI);
    this.sphereDirty = true;
  }

  setMarkers(markers: Marker[]): void {
    this.markers = markers.map((m, i) => ({
      ...m,
      v: llToVec(m.lat, m.lon),
      phase: (i * 0.19) % 1,
      sx: null, sy: null, sr: 0,
    }));
  }

  setSelected(id: string | null): void { this.selected = id; }

  focus(lat: number, lon: number): void {
    const face: Vec3 = [0, 0.18, 0.983];   // slight tilt so north reads up
    this.target = qFromUnit(llToVec(lat, lon), face);
    this.focusing = true;
    this.velX = 0;
    this.velY = 0;
  }

  setSpin(on: boolean): void { this.spin = on && !this.reduceMotion; }
  isSpinning(): boolean { return this.spin; }

  on(event: "pick", cb: PickListener): () => void;
  on(event: "hover", cb: HoverListener): () => void;
  on(event: "pick" | "hover", cb: PickListener | HoverListener): () => void {
    if (event === "pick") {
      this.pickListeners.add(cb as PickListener);
      return () => this.pickListeners.delete(cb as PickListener);
    }
    this.hoverListeners.add(cb as HoverListener);
    return () => this.hoverListeners.delete(cb as HoverListener);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const off of this.cleanups) off();
    this.cleanups.length = 0;
    this.pickListeners.clear();
    this.hoverListeners.clear();
  }

  // ---- private ------------------------------------------------------------

  private listen<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions
  ): void {
    this.canvas.addEventListener(type, handler as EventListener, options);
    this.cleanups.push(() =>
      this.canvas.removeEventListener(type, handler as EventListener, options)
    );
  }

  private bindEvents(): void {
    // Compact mode is a picture, not an instrument: no drag, no pick, no keys.
    // The host component puts a link over it.
    if (this.compact) return;
    // ...port lines 534–561 here, registering each handler through this.listen
    // so destroy() removes it. Pointer move → this.emitHover, pointer up
    // without drag → this.emitPick.
  }

  private emitPick(id: string | null): void {
    for (const cb of this.pickListeners) cb(id);
  }

  private emitHover(id: string | null, x: number, y: number): void {
    for (const cb of this.hoverListeners) cb(id, x, y);
  }

  private pickAt(x: number, y: number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const m of this.markers) {
      if (m.sx == null || m.sy == null) continue;
      const d = Math.hypot(m.sx - x, m.sy - y);
      if (d < m.sr && d < bestD) { bestD = d; best = m.id; }
    }
    return best;
  }

  private tick = (): void => {
    // ...port lines 492–521, then:
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(): void {
    // ...port lines 443–484, with one substantive change: colour and size come
    // from the marker, never from a category lookup.
    //   const col = m.color;
    //   const height = (0.05 + m.weight * 0.26) * this.R;
    //   const rad = (2.4 + m.weight * 4.5) * (0.7 + base[2] * 0.3);
    //   pulse ring when m.weight >= 0.68 && !this.reduceMotion
  }

  private setSphereRes(s: number): void { /* ...port lines 356–367 */ }
  private renderSphere(): void { /* ...port lines 391–431, reading this.textures */ }
}
```

Fill every `// ...port` comment with the real ported body before moving on. The bodies are in the prototype at the cited lines; the only edits are `state.x` → `this.x`, globals → fields, and the marker changes noted above.

- [ ] **Step 3: Re-export**

Create `src/lib/pulse/globe-engine/index.ts`:

```ts
export { GlobeEngine, type GlobeEngineOptions } from "./engine";
export { loadEarthTextures, DEFAULT_TEXTURE_URLS } from "./textures";
export * from "./math";
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors. (`npm run build` also typechecks, but `tsc` is faster for this loop.)

- [ ] **Step 5: Confirm the maths tests still pass**

```bash
npm run test:lib 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pulse/globe-engine
git commit -m "feat: GlobeEngine — canvas renderer that knows markers, not hazards"
```

---

### Task 12: `PulseGlobe` React wrapper

The only component that touches the engine. Everything else talks to it through props.

**Files:**
- Create: `src/components/pulse/pulse-globe.tsx`

**Interfaces:**
- Consumes: `GlobeEngine` from `@/lib/pulse/globe-engine`; `Marker` from `@/lib/pulse/types`.
- Produces: `PulseGlobe` with props `{ markers: Marker[]; selectedId: string | null; compact?: boolean; spin?: boolean; focusOn?: { lat: number; lon: number } | null; onPick?: (id: string | null) => void; onHover?: (id: string | null, x: number, y: number) => void }`.

- [ ] **Step 1: Write the component**

Create `src/components/pulse/pulse-globe.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { GlobeEngine } from "@/lib/pulse/globe-engine";
import type { Marker } from "@/lib/pulse/types";

interface PulseGlobeProps {
  markers: Marker[];
  selectedId?: string | null;
  compact?: boolean;
  spin?: boolean;
  focusOn?: { lat: number; lon: number } | null;
  onPick?: (id: string | null) => void;
  onHover?: (id: string | null, x: number, y: number) => void;
}

export function PulseGlobe({
  markers, selectedId = null, compact = false, spin = true,
  focusOn = null, onPick, onHover,
}: PulseGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GlobeEngine | null>(null);

  // Callbacks live in refs so a parent re-render never tears the engine down.
  const onPickRef = useRef(onPick);
  const onHoverRef = useRef(onHover);
  onPickRef.current = onPick;
  onHoverRef.current = onHover;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GlobeEngine(canvas, { compact });
    engineRef.current = engine;

    const offPick = engine.on("pick", (id) => onPickRef.current?.(id));
    const offHover = engine.on("hover", (id, x, y) => onHoverRef.current?.(id, x, y));

    const host = canvas.parentElement;
    const observer = new ResizeObserver(() => engine.resize());
    if (host) observer.observe(host);

    return () => {
      observer.disconnect();
      offPick();
      offHover();
      engine.destroy();
      engineRef.current = null;
    };
  }, [compact]);

  useEffect(() => { engineRef.current?.setMarkers(markers); }, [markers]);
  useEffect(() => { engineRef.current?.setSelected(selectedId); }, [selectedId]);
  useEffect(() => { engineRef.current?.setSpin(spin); }, [spin]);
  useEffect(() => {
    if (focusOn) engineRef.current?.focus(focusOn.lat, focusOn.lon);
  }, [focusOn]);

  return (
    <canvas
      ref={canvasRef}
      className="pulse-canvas"
      tabIndex={compact ? -1 : 0}
      aria-label={
        compact
          ? "Rotating globe showing current natural hazards"
          : "Interactive globe of current natural hazards. Use arrow keys to rotate. Every event is also listed in the events panel."
      }
    />
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/pulse/pulse-globe.tsx
git commit -m "feat: PulseGlobe — the only component that touches the engine"
```

---

### Task 13: `/pulse` page and HUD

Sandbox Daily's dark room, not a stranger's page. Dark canvas kept (cream behind a planet reads as a diagram, not a view from orbit); every accent rebound to site tokens.

**Files:**
- Create: `src/app/pulse/page.tsx`
- Create: `src/components/pulse/pulse-client.tsx`
- Create: `src/components/pulse/layer-panel.tsx`
- Create: `src/components/pulse/event-console.tsx`
- Create: `src/components/pulse/detail-panel.tsx`
- Create: `src/components/pulse/hazard-index.tsx`
- Modify: `src/app/globals.css` (append a `.pulse-*` block, following the existing `.sd-hero*` pattern)

**Interfaces:**
- Consumes: `getPulseSnapshot` from `@/lib/pulse/snapshot`; `PulseSnapshot`, `LayerEvent`, `Marker` from `@/lib/pulse/types`; `PulseGlobe`; `CATEGORY_ORDER` from `@/lib/pulse/layers/hazards`.
- Produces: the route. Nothing downstream depends on it.

Required behaviours, each verified in the browser in Task 15:

1. **Grouped layers, not flat chips.** `LayerPanel` renders one group per layer (`layer.label` as a heading) with that layer's categories inside. One layer today, so one group — the grouping is structural, not decorative.
2. **Only registered layers render.** No "coming soon" rows on a public page.
3. **The event console is real `<button>` elements** — the prototype's five `innerHTML` sites are neither keyboard-reachable nor screen-reader legible. Every event is reachable by Tab, activates on Enter/Space, and selecting one focuses the globe.
4. **Honest freshness.** `stale === true` → the HUD reads `Snapshot` with the real `generatedAt` timestamp. Only fresh data reads `Live`.
5. **Partial sources named.** `layers.filter(l => !l.live)` produces `EONET unavailable` in the HUD, not a silent gap.
6. **Unplottable counted.** `unplottable > 0` renders `41 events · 3 unplottable`.
7. **Zero events → an explicit empty state**, not an unexplained bare globe.

- [ ] **Step 1: Write the server page**

Create `src/app/pulse/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getPulseSnapshot } from "@/lib/pulse/snapshot";
import { PulseClient } from "@/components/pulse/pulse-client";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Planet Pulse — Sandbox Daily",
  description:
    "A live globe of the natural hazards currently burning, shaking and flooding across the planet, from NASA EONET and USGS.",
};

export default async function PulsePage() {
  const snapshot = await getPulseSnapshot();
  return <PulseClient snapshot={snapshot} />;
}
```

- [ ] **Step 2: Write the client shell**

Create `src/components/pulse/pulse-client.tsx`. It owns: `activeCategories: Set<string>` (empty = all), `query: string`, `sort: "recent" | "severity"`, `selectedId: string | null`, `spin: boolean`. It derives markers from filtered events:

```tsx
const markers: Marker[] = useMemo(
  () => visible.map((e) => ({
    id: e.id,
    lat: e.lat,
    lon: e.lon,
    color: categories[e.category]?.color ?? "#98989D",
    weight: e.severity,
  })),
  [visible, categories]
);
```

Freshness line — the rule made literal:

```tsx
const freshness = snapshot.stale
  ? { label: "Snapshot", live: false }
  : { label: "Live", live: true };
```

Empty state:

```tsx
{snapshot.events.length === 0 && (
  <p className="pulse-empty">
    No open hazards reported in the last seven days.
    {deadSources.length > 0 && ` ${deadSources.join(" and ")} unavailable.`}
  </p>
)}
```

- [ ] **Step 3: Write `event-console.tsx` with real buttons**

```tsx
<ul className="pulse-list">
  {events.map((e) => (
    <li key={e.id}>
      <button
        type="button"
        onClick={() => onSelect(e.id)}
        aria-current={e.id === selectedId}
        className="pulse-ev"
      >
        <span className="pulse-ev-dot" style={{ background: categories[e.category]?.color }} />
        <span className="pulse-ev-title">{e.title}</span>
        <span className="pulse-ev-meta">
          {categories[e.category]?.label} · {timeAgo(e.date, now)}
        </span>
      </button>
    </li>
  ))}
</ul>
```

`timeAgo` and `severityLabel` port from prototype lines 223–231 into `src/components/pulse/format.ts`. They are display helpers, not domain logic — no tests, consistent with the stated testing boundary.

- [ ] **Step 4: Write `layer-panel.tsx`, `detail-panel.tsx`, `hazard-index.tsx`**

`layer-panel.tsx` — one `<fieldset>` per layer, so the grouping is structural rather than a visual convention:

```tsx
{layers.map((layer) => (
  <fieldset key={layer.id} className="pulse-group">
    <legend className="pulse-group-label">{layer.label}</legend>
    {CATEGORY_ORDER.filter((c) => counts[c] > 0).map((c) => {
      const meta = layer.categories[c];
      const on = active.size === 0 || active.has(c);
      return (
        <button
          key={c}
          type="button"
          aria-pressed={on}
          onClick={() => onToggle(c)}
          className="pulse-chip"
          style={{ borderColor: on ? `${meta.color}88` : "transparent" }}
        >
          <span className="pulse-chip-dot" style={{ background: meta.color, opacity: on ? 1 : 0.4 }} />
          {meta.label}
          <span className="font-mono">{counts[c]}</span>
        </button>
      );
    })}
  </fieldset>
))}
```

A "Reset" button renders only when `active.size > 0`.

`detail-panel.tsx`: severity label, magnitude (or `—`), observed-time, source, a severity meter, coordinates to 2 dp, and an outbound link to `event.url` when present (`target="_blank" rel="noopener noreferrer"`). Close button is a real `<button aria-label="Close">`.

`hazard-index.tsx`: score 0–100, band name, band colour from `LayerIndex.color`, subtitle `${events.length} events · ${wildfires} wildfires`. Count-up animation only when `!prefers-reduced-motion`.

- [ ] **Step 5: Add the styles**

Append to `src/app/globals.css`, matching the existing `.sd-hero*` convention:

```css
/* ---- Planet Pulse -------------------------------------------------------- */
.pulse-stage {
  position: relative;
  width: 100%;
  height: calc(100vh - 64px);   /* the root layout's pt-16 nav offset */
  min-height: 560px;
  background: var(--color-ink);
  overflow: hidden;
  isolation: isolate;
}

.pulse-canvas {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity var(--dur-page) var(--ease-out);
  touch-action: none;
  cursor: grab;
}
.pulse-canvas.ready { opacity: 1; }
.pulse-canvas.grabbing { cursor: grabbing; }
.pulse-canvas:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }

.pulse-pip {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--color-accent);
  animation: pulse-blink var(--dur-pulse) ease-in-out infinite;
}
.pulse-pip[data-stale="true"] { background: var(--color-grey); animation: none; }

@keyframes pulse-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

@media (prefers-reduced-motion: reduce) {
  .pulse-pip { animation: none; }
}
```

Tabular numerics (score, counts, coordinates) use `font-mono`; everything else uses the site stack. The prototype's blanket `ui-monospace` does not survive the port.

- [ ] **Step 6: Typecheck and lint**

```bash
npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 7: Look at it**

```bash
npm run dev
```
Open `http://localhost:3000/pulse`. Confirm: globe renders and spins; markers appear; clicking a marker selects and focuses; the event console lists every event; Tab reaches every console button; the HUD says "Live" with a real timestamp; counts match `/api/pulse`.

- [ ] **Step 8: Commit**

```bash
git add src/app/pulse src/components/pulse src/app/globals.css
git commit -m "feat: /pulse — public hazard globe with grouped layers and honest freshness"
```

---

### Task 14: Nav entry + homepage teaser

`PulseTeaser` is the same `GlobeEngine` in **compact mode**, defined exactly as: markers rendered, auto-spin on, no HUD, no picking, no event console, pointer events limited to a single click that navigates to `/pulse`. Event count and hazard index render as plain text beside the globe — **not** the gauge component.

**Files:**
- Create: `src/components/pulse/pulse-teaser.tsx`
- Modify: `src/components/nav.tsx:9-14`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add PULSE to the nav**

In `src/components/nav.tsx`, extend `navLinks`:

```ts
const navLinks = [
  { href: "/news", label: "NEWS", indicator: "border-orange" },
  { href: "/tech", label: "TECH", indicator: "border-cream" },
  { href: "/sport", label: "SPORT", indicator: "border-accent" },
  { href: "/features", label: "FEATURES", indicator: "border-orange" },
  { href: "/pulse", label: "PULSE", indicator: "border-accent" },
];
```

- [ ] **Step 2: Write the teaser**

Create `src/components/pulse/pulse-teaser.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PulseGlobe } from "./pulse-globe";
import type { PulseSnapshot, Marker } from "@/lib/pulse/types";

export function PulseTeaser({ snapshot }: { snapshot: PulseSnapshot }) {
  const layer = snapshot.layers[0];

  const markers: Marker[] = useMemo(
    () => snapshot.events.map((e) => ({
      id: e.id, lat: e.lat, lon: e.lon,
      color: layer?.categories[e.category]?.color ?? "#98989D",
      weight: e.severity,
    })),
    [snapshot.events, layer]
  );

  if (snapshot.events.length === 0) return null;

  return (
    <Link href="/pulse" className="pulse-teaser" aria-label="Planet Pulse — the live hazard globe">
      <div className="pulse-teaser-globe">
        <PulseGlobe markers={markers} compact spin />
      </div>
      <div className="pulse-teaser-copy">
        <p className="pulse-teaser-eyebrow">Planet Pulse</p>
        <p className="pulse-teaser-stat">
          <span className="font-mono">{snapshot.events.length}</span> active hazards
        </p>
        {layer?.index && (
          <p className="pulse-teaser-stat">
            Hazard index <span className="font-mono">{layer.index.score}</span>
            <span style={{ color: layer.index.color }}> {layer.index.band}</span>
          </p>
        )}
        <span className="pulse-teaser-cta">Open the globe →</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Mount it on the homepage**

In `src/app/page.tsx`, fetch the snapshot alongside the existing data and place the teaser between `TrendingBar` and `ArticleGrid`:

```tsx
import { getPulseSnapshot } from "@/lib/pulse/snapshot";
import { PulseTeaser } from "@/components/pulse/pulse-teaser";

// inside Home():
const pulse = await getPulseSnapshot();

// in the JSX, after <TrendingBar ... />:
<PulseTeaser snapshot={pulse} />
```

Note the homepage is already `async` and already awaits `getTickerHeadlines()`; this adds no new pattern. The layer's `fetch` is cached for 600s, so the homepage and `/pulse` share one upstream request.

- [ ] **Step 4: Add teaser styles to `globals.css`**

```css
.pulse-teaser {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: var(--space-8);
  align-items: center;
  max-width: var(--grid-max);
  margin: 0 auto;
  padding: var(--space-12) var(--space-6);
  background: var(--color-ink);
  color: var(--color-cream);
  text-decoration: none;
}
.pulse-teaser-globe { position: relative; width: 200px; height: 200px; }
.pulse-teaser-globe .pulse-canvas { cursor: pointer; }
.pulse-teaser-eyebrow {
  font-family: var(--font-family-mono);
  font-size: var(--text-meta);
  letter-spacing: var(--tracking-mono-wide);
  text-transform: uppercase;
  color: var(--color-accent);
}
.pulse-teaser-cta { color: var(--color-accent); }

@media (max-width: 640px) {
  .pulse-teaser { grid-template-columns: 1fr; justify-items: center; text-align: center; }
}
```

- [ ] **Step 5: Verify both surfaces**

```bash
npx tsc --noEmit && npm run lint && npm run dev
```
Open `http://localhost:3000/`: teaser globe spins, shows the count and index, whole block is one link to `/pulse`, no HUD, dragging does nothing. Open `/pulse`: PULSE is the active nav item.

- [ ] **Step 6: Commit**

```bash
git add src/components/nav.tsx src/components/pulse/pulse-teaser.tsx src/app/page.tsx src/app/globals.css
git commit -m "feat: PULSE nav entry + homepage teaser globe"
```

---

### Task 15: Verification pass and deploy

No claim of "done" survives without evidence. Every check below is run, and its actual output reported.

- [ ] **Step 1: Full test suite**

```bash
npm run test:lib 2>&1 | tail -8
```
Expected: `ℹ fail 0`, pass count ≥ 110.

- [ ] **Step 2: Production build**

```bash
npm run build 2>&1 | tail -30
```
Expected: compiled successfully, `/pulse` and `/api/pulse` listed in the route table, and **no function-size warning**. If a size warning appears, check `public/pulse/*` against `outputFileTracingExcludes` — this repo has been bitten twice by exactly that.

- [ ] **Step 3: Cross-breakpoint browser QA**

```bash
npm run start
```
At 1440px, 820px and 390px, on `/pulse` and `/`:
- globe is round, centred, and fills its box at every width
- markers sit on the correct continents — spot-check three known events against their `place`/title text; a hemisphere flip is the failure this catches
- the console opens and closes on mobile
- Tab reaches: canvas → layer toggles → search → sort → every event button
- arrow keys rotate the globe when it has focus
- HUD reads "Live" with a plausible timestamp
- no horizontal scroll on the body at any width

- [ ] **Step 4: Reduced-motion check**

macOS System Settings → Accessibility → Display → Reduce motion, on. Reload `/pulse`.
Expected: no auto-spin, no pulse rings, no count-up animation, status pip static. Drag still works.

- [ ] **Step 5: Degradation check — prove the honesty rule holds**

Temporarily point `EONET_URL` in `src/lib/pulse/layers/hazards.ts` at `https://eonet.gsfc.nasa.gov/api/v3/nope`, restart, reload `/pulse`.
Expected: quakes still render, HUD names EONET as unavailable, page does not blank. Then break both URLs: expected is either the explicit empty state or a "Snapshot" label with a real timestamp — **never** the word "Live". Revert both URLs before committing.

- [ ] **Step 6: Deploy to a preview**

```bash
npx vercel --scope digital-inroads
```
Then open the preview URL and re-run Step 3's spot-checks against it. Note: `*.vercel.app` previews on this project sit behind Vercel deployment protection — if the URL 401s, open it in a browser logged into the team rather than assuming a broken deploy.

- [ ] **Step 7: Report, then decide on prod**

Write up the actual results: test count, build output, what the browser showed at each breakpoint, and the preview URL. Promoting to production is SanSan's call, not an automatic step — `feat/planet-pulse` also has to be merged deliberately, since the in-progress hero and content work lives on a different branch.

- [ ] **Step 8: Update the registry**

Per the router rules, update `~/brain/PROJECTS.md` (Planet Pulse status, what shipped, next action) and commit in `~/brain`:

```bash
git -C ~/brain add -A && git -C ~/brain commit -m "registry: Planet Pulse built"
```

---

## Open decisions for SanSan

Neither blocks the build; both are worth a sentence before Task 15 promotes anything.

1. **Does `/pulse` go in the footer as well as the nav?** The nav gains a fifth entry, which is the spec's decision. The footer is not covered either way.
2. **Prod promotion.** The plan stops at a verified preview. Merging `feat/planet-pulse` into `main` and promoting is a deliberate call, because `main` also carries unfinished hero and content work.

*Last updated: 2026-07-30*

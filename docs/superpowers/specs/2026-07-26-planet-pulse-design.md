# Planet Pulse — design spec

Status: approved 2026-07-26
Scope: layer 1 (natural hazards) shipped public; layer contract proven for later layers.

## Origin

Planet Pulse began as a Claude artifact built 2026-07-26
(`https://claude.ai/code/artifact/ecb3f36f-8756-4ab2-9305-aa21f7438a42`). It was
described as a "Live Natural Hazard Globe" but contained **no network calls** —
41 events were hardcoded as `const EVENTS`, dated 2026-07-23 to 2026-07-26. The
HUD said "Snapshot feed"; the title said "Live". It was never deployed to Vercel.

The artifact source is rescued to `prototypes/planet-pulse/index.html` (1.2MB,
of which ~1.19MB is base64 textures). It is the visual reference, not the
codebase. Its renderer is hand-rolled canvas — quaternion slerp, custom
projection, custom texture compositor, no 3D library — and that maths is ported,
not rewritten.

## Purpose

A public reader-facing dashboard at `/pulse` on Sandbox Daily. The globe is a
**substrate**: natural hazards are layer one, and later layers (conflict, civil
unrest, viral video) plug into the same renderer without touching it.

Entry point is a compact teaser on the Sandbox Daily homepage showing event count
and hazard index, clicking through to the full page. There is deliberately **no
article-matching** — the globe does not try to guess which of your articles
relate to an event.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Audience | Public reader feature | Engagement surface + portfolio piece |
| Site link | Homepage teaser → full page | No fragile article-matching heuristics |
| Extensibility | Grouped layers, not flat chips | A single "hazard index" cannot meaningfully score a viral video |
| Port strategy | Engine/UI split | Engine must stop knowing what a wildfire is |
| Layer chrome at launch | Only registered layers render | Grouped model, but no dead "coming soon" rows on a public page |
| Renderer | Port existing canvas maths | Works and looks right; a 3D library solves a maintenance problem we don't have |

### Constraint: no local-filesystem data

`src/lib/radar/` reads `~/Desktop/ssnn-outputs/event-radar/events.json`, which is
why `/admin/radar` calls `notFound()` in production. That data does not exist on
Vercel.

Planet Pulse is public, so **every layer must have a publicly fetchable source**.
The existing radar feed is a natural fit for a future conflict/unrest layer — it
already carries `tone`, `volume`, `score`, `sources` — but it has no coordinates
(`location: "global" | "london"`) and no public endpoint. Making it a layer
requires geocoding it *and* publishing it somewhere fetchable. Out of scope here;
recorded so layer 2 isn't designed from a false premise.

## Architecture

Four units, each independently testable.

### `src/lib/pulse/globe-engine.ts`

Framework-agnostic TypeScript. No React, no data knowledge, no hazard concepts.

```ts
interface Marker { id: string; lat: number; lon: number; color: string; weight: number }

class GlobeEngine {
  constructor(canvas: HTMLCanvasElement, textures: Textures)
  setMarkers(markers: Marker[]): void
  focus(lat: number, lon: number): void
  setSpin(on: boolean): void
  on(event: "pick", cb: (id: string) => void): () => void
  resize(): void
  destroy(): void
}
```

Ported from the prototype: `llToVec`, `qmul`, `qaxis`, `qnorm`, `qmat`,
`qFromUnit`, `qslerp`, `buildEarthTexture`, `setSphereRes`, `renderSphere`,
`project`, `draw`, `applySpin`, `tick`, `dist2`, `pick`.

### `src/lib/pulse/layers/`

One file per layer, each exporting a `LayerSource`:

```ts
interface LayerSource {
  id: string;
  label: string;
  categories: Record<string, { label: string; color: string; weight: number }>;
  fetch(): Promise<LayerEvent[]>;   // server-side only
  index?(events: LayerEvent[]): { score: number; band: string };
}
```

Layer 1 is `layers/hazards.ts`. Adding a layer later = a new file plus one line
in the registry.

### Normalised event shape

Every layer, present and future, produces this:

```ts
interface LayerEvent {
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
```

### `src/app/api/pulse/route.ts`

Server route handler. Calls each registered layer's `fetch()`, merges,
normalises, caches. Server-side so the browser never calls NASA directly: no
CORS exposure, no per-visitor rate-limit risk, one cached payload for all
traffic.

`revalidate: 600`. Ten minutes — EONET updates on the order of hours, and a news
globe does not need per-second earthquake data. Upstream sees one request per ten
minutes regardless of visitor count.

### React components

`PulseGlobe` (mounts engine, owns canvas lifecycle + resize observer — the only
component touching the engine), `LayerPanel`, `EventConsole`, `DetailPanel`,
`HazardIndex`, `PulseTeaser`.

`PulseTeaser` is the homepage widget: the same `GlobeEngine` instance type in
**compact mode**, defined as — markers rendered, auto-spin on, no HUD, no
picking, no event console, pointer events limited to a single click that
navigates to `/pulse`. It renders the event count and hazard index as plain text
beside the globe, not as the gauge component.

Textures move from base64 to `/public/pulse/{day,topo,clouds}.jpg`.

## Data sources

Both verified live and keyless on 2026-07-26.

### NASA EONET v3

`https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7`

Three shape traps, each with a test:

1. **Category ids are camelCase plural** (`severeStorms`, `wildfires`) while the
   prototype's keys are singular (`severeStorm`). Requires an explicit mapping
   table, not string manipulation. Unmapped categories fall to `other` rather
   than being dropped.
2. **`geometry` is an array, not a point.** A typhoon carries its whole track.
   Take the entry with the latest `date`, or storms plot where they were days ago.
3. **`geometry[].type` may be `Polygon`** (wildfire perimeters), not only
   `Point`. Reduce polygons to a centroid.

Coordinates are `[lon, lat]`.

### USGS

`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson`

Coordinates are `[lon, lat, depth]` — inverting lon/lat silently plots events in
the wrong hemisphere. `properties.time` is epoch milliseconds → ISO.

### Severity normalisation

USGS magnitude maps on a clamped curve: 4.5 → 0.3, 7.0+ → 1.0, linear between,
clamped at both ends.

**Correction (2026-07-30):** this section originally claimed EONET fire
magnitudes were reported in MW, that EONET's units were "mutually
incompatible" across categories, and that magnitude was "often omitted
entirely." All three claims were wrong, measured against the committed
fixture `src/lib/pulse/fixtures/eonet-live.json`:

```
wildfires      unit=acres  n=42  missing=0   min 500 · p25 890 · med 3,000 · p75 15,673 · max 280,000
severeStorms   unit=kts    n= 4  missing=0   min  30 · p25  30 · med    80 · p75     85 · max     140
```

Fire magnitude is acres, not MW. Units are consistent *within* each category
— which is the only place they are ever compared — so "incompatible" was
never the actual constraint. And coverage in the live feed is 100%, not
sparse. The result of building on the wrong claims: every wildfire's
`severity` came from the constant category weight, so all 42 wildfires in the
live fixture rendered as an identical severity of 1.0 — same spike height,
same dot radius, same pulse-ring state, and the detail panel could assert
"Severity: Extreme" for a fire that was actually one of the smallest in the
feed. The hazard index, being computed from those same constants, inflated
to 94 on the committed fixture as a direct consequence.

The fix, in `src/lib/pulse/severity.ts`, alongside `severityFromMagnitude`
(USGS) and `severityFromWeight` (the category-weight fallback): two new
curves, selected per category by a `severityFor()` dispatcher, with
`severityFromWeight` remaining the fallback for anything a curve can't cover.

**Wildfire — acres, log10-linear.** `severityFromWildfireAcres`. Fire area
spans three orders of magnitude in the live feed (500 – 280,000 acres), so a
linear map would compress everything below ~50,000 acres into the bottom
fifth. Anchored at 100 acres → 0.25 (near the smallest fire EONET tracks) and
500,000 acres → 1.0 (a genuinely catastrophic burn), log10-linear between,
clamped at both ends. Against the real distribution above: 500 acres → 0.39,
3,000 acres → 0.55, 280,000 acres → 0.95 — a spread of 40 distinct severities
across the 42 live wildfires, where there was previously exactly one value.

**Severe storm — knots, Saffir-Simpson-shaped.** `severityFromStormKts`.
Anchored at 30 kts (below tropical-storm force) → 0.3 and 137 kts (the
category 5 threshold) → 1.0, linear between, clamped. Against the real
values: 30 kts → 0.30, 80 kts → 0.63, 85 kts → 0.66, 140 kts (clamped) →
1.0.

**Everything else** — an unrecognised unit (e.g. a wildfire reported in MW
rather than acres), a missing magnitude, or a category with no curve at all
(volcano, earthquake, flood, drought, landslide, sea/lake ice, dust/haze,
other) — keeps the category-weight fallback via `severityFromWeight`. This is
not a regression; it is the honest default for something we genuinely cannot
measure, and `severityFrom: "category"` records it as such so the UI never
presents a baseline as if it were a reading.

Measured effect on the committed fixture (`eonet-live.json` +
`usgs-live.json`, merged): the hazard index moves from **94 → 80** — still
"Severe" (≥75), but no longer inflated by a wall of 1.0s that were never a
measurement of anything.

### Merge and dedupe

A significant earthquake can appear in **both** EONET and USGS. Without dedupe,
one event renders as two markers.

Dedupe rule, stated exactly so it is testable: two events collapse when they
share a category **and** are within **50 km** great-circle distance **and**
within **2 hours** of each other. The USGS record wins, as it carries a precise
magnitude. These thresholds are the initial values and may be tuned against real
data; the test asserts the rule, not a tuned constant.

## Visual design

Sandbox Daily has an existing token system the prototype ignores. Resolution:
keep the dark canvas — cream behind a planet reads as a diagram, not a view from
orbit — and rebind every accent to site tokens.

| Role | Prototype | Becomes |
|---|---|---|
| Live / interactive | `#4fd0c0` teal | `#56A077` Synaptic Green |
| Wildfire | `#ff5a1f` | `#E75D31` Cortex Orange |
| HUD type | `ui-monospace` throughout | Site font stack; mono only for tabular numerics |
| Status pip | bespoke 1.8s animation | existing `--dur-pulse: 1500ms` token |

Nav gains a fifth entry, `PULSE`, indicator `border-accent`.

`/pulse` should read as Sandbox Daily's dark room, not a stranger's page.

## Accessibility

The canvas keeps its `tabindex` and arrow-key rotation. The event console is
built from real `<button>` elements (replacing the prototype's five `innerHTML`
sites, which are neither keyboard-reachable nor screen-reader legible) and is
fully operable without touching the globe.

## Testing

The repo runs `node --import tsx --test src/lib/**/*.test.ts`. There is no React
test runner and none is being added — that dependency does not pay for itself
here.

**Consequence, stated plainly: logic gets test-first development; visuals get
manual browser verification.** No claim of blanket coverage.

Test-first, in `src/lib/pulse/`:

- `normaliseEonet()` — fixtures captured from live responses. Covers camelCase
  mapping, latest-point selection from multi-point geometry, `Polygon` centroid
  reduction, unmapped category → `other`. Also asserts, against the real
  `eonet-live.json` fixture, that wildfire severities spread across the real
  acreage distribution rather than collapsing to a single value — the
  regression test for the flatness bug this section's correction describes.
- `normaliseUsgs()` — `[lon, lat, depth]` ordering, epoch-ms → ISO.
- `severityFor()` — both magnitude curves (wildfire acres, severe-storm
  knots) at their anchors and clamps, plus the category-weight fallback for
  an unrecognised unit, a missing magnitude, or a category with no curve.
- `hazardIndex()` — scoring, band thresholds, empty input.
- `mergeLayers()` — cross-source dedupe.
- Engine maths — `llToVec`, quaternion normalise/slerp. Pure; no canvas needed.

Fixtures are committed so tests never hit the network.

## Failure handling

- `Promise.allSettled` per source. One dead source degrades to partial data,
  never a blank page. HUD lists which sources are live.
- Both sources dead → last good cache with `stale: true`. HUD switches "Live" to
  "Snapshot" and shows the real timestamp. **The UI can never claim freshness it
  does not have** — the originating artifact's failure, not repeated.
- Events with unusable geometry are dropped rather than plotted at `NaN`, and
  counted: "41 events, 3 unplottable" is visible, not silent.
- Zero events → explicit empty state, not an unexplained bare globe.

## Out of scope

- Conflict, civil unrest, and viral-video layers (contract proven; sources not
  built)
- Geocoding or publishing the `ssnn-outputs` event radar feed
- Article ↔ event matching in either direction
- Any React test runner

*Last updated: 2026-07-30*

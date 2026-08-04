# Globe: signal vs texture

**Date:** 2026-08-04 · **Status:** approved by SanSan (direction + scope + design sections)

## Problem

The globe plots ~349 markers and every one makes the same visual claim: a pin
that says "this matters". ~220 are FIRMS fire clusters — raw satellite
detections, not curated events — and ~100 are a rolling week of M4.5+ quakes.
The result reads as congestion, and a pin stops meaning anything. The site
runs on an editorial gate everywhere else; the globe is the one surface that
doesn't.

## Decision

Two-tier presentation, same visual language on BOTH globes (front-page hero
and /pulse): **pins** for editorial-grade events, **embers** — soft,
non-interactive glow — for bulk detections. The congestion becomes the
texture: dense fire belts accumulate into a glow field under the additive
compositing the engine already uses.

Retention windows, source caps and fetch behaviour are all unchanged. The
regional FIRMS allocation (cap 220) and the week of seismicity survive intact
— texture does not congest.

## Tier rules

One pure function, `markerKindOf(event: LayerEvent): "pin" | "ember"`, in
`src/lib/pulse/marker-kind.ts`:

| Event | Kind | Rationale |
|---|---|---|
| FIRMS (`source === "FIRMS"`) | ember | unnamed raw satellite detections |
| Earthquake with measured magnitude ≥ M5.5 | pin | significant seismicity |
| Earthquake below M5.5, or magnitude unmeasured (`severityFrom === "category"`) | ember | routine seismicity |
| Everything else (GDACS current, EONET open incidents, radar headlines, volcano, storms, floods…) | pin | already curated/named upstream |

The M5.5 threshold is expressed in severity space —
`severity >= severityFromMagnitude(5.5)` with `severityFrom === "magnitude"`
— so no display-string parsing and the rule stays consistent with how quake
severity is already derived (normalise-usgs.ts). GDACS quakes carry
alert-level severity (`severityFrom "magnitude"`), so red/orange GDACS quakes
naturally clear the same bar.

Expected mix on today's data: ~75–90 pins, ~300 embers.

## Data model

`Marker` (src/lib/pulse/types.ts) gains `kind: "pin" | "ember"`. Both
construction sites assign it via `markerKindOf`:

- `markersFromSnapshot` (src/lib/pulse/hero.ts) — front page
- the `markers` memo in src/components/pulse/pulse-client.tsx — /pulse

Stale-snapshot dimming is orthogonal and unchanged: dimmed mode dims both
kinds exactly as it dims everything today.

## Rendering (globe-engine/engine.ts)

In the existing sorted draw loop, branch on `kind`:

- **pin** — exactly today's rendering: stem, additive bloom, white core,
  pulse ring at weight ≥ 0.68, hit target (`sx/sy/sr`).
- **ember** — one small radial gradient at the surface point: radius
  `(1.2 + weight * 2.2) * (0.7 + z * 0.3) * bloom`, alpha 0.4 (final value
  settled during visual verification, 0.3–0.5 band), drawn in the
  same `lighter` composite pass. No stem, no white core, no pulse ring.
  `sx` stays `null`, so the existing hover/pick hit-test skips embers with no
  further changes.

Selection from the /pulse console list still works for ember events: when
`this.selected === marker.id`, the engine draws the existing white selection
ring around the ember (selection arrives from the list; the ember just has no
hover/pick target of its own). The no-terrain bloom damping (×0.55) applies
to embers the same as pins.

## What does NOT change

- Fetch windows, caps, sources, merge/dedupe, per-event news expiry
- "ON THE GLOBE RIGHT NOW" index and hazard-index counts — embers are on the
  globe and stay counted
- /pulse console list, filters, search — every event stays browsable
- Hero event cards — pins only, as before (embers were never hoverable)
- Poster image, terrain reveal, reduced-motion behaviour

## Testing & verification

- TDD (node:test, src/lib): `marker-kind.test.ts` — every row of the tier
  table, including the unmeasured-magnitude quake and the GDACS alert-level
  quake clearing the bar; `hero.test.ts` additions — `markersFromSnapshot`
  stamps `kind`; dimmed mode keeps both kinds.
- Engine is canvas: visual verification via CDP screenshots at 390×844 and
  1280×720, front page and /pulse, before/after. Confirm: fire belts read as
  glow, pins legible, hover cards still work on pins, list-selection ring
  appears on an ember.
- `npm run test:lib`, lint (26 pre-existing findings is the baseline), build.

## Out of scope

Cluster badges, cap/window tuning, any change to /pulse console layout, any
new dependency.

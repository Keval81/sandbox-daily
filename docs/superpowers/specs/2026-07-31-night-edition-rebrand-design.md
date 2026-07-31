# Night Edition — landing-page rebrand around the Planet Pulse globe

**Date:** 2026-07-31 · **Approved by:** SanSan (structure, register, storyboard,
architecture, honesty rules, testing, rollout — each gated separately in the
brainstorm; mockups in `.superpowers/brainstorm/33494-1785484898/content/`)

## Goal

The Planet Pulse globe becomes the landing-page centrepiece. The front door
turns dark ("Night Edition") while the editorial body stays cream. The globe
remains a **substrate**: hazards are layer 1; wars, civil unrest and other
layers come later, and nothing in this design may assume "hazards" is the only
layer.

## Decisions locked

| Decision | Choice |
|---|---|
| Landing structure | **A — globe is the hero.** Full-viewport globe hero; scroll continues into the existing cream editorial front page. |
| Visual register | **Night Edition.** Cream identity inverted, not abandoned: serif masthead over ink, riso grain carried into the dark, warm-lit globe, mono only for live figures, one witty generated aside. (Mission Control and Cosmic Brand-Tech registers shown and rejected.) |
| Homepage globe depth | **Ambient + drag.** Auto-spin, live pulsing markers, drag-to-rotate. No tap-to-select, no HUD, no filters — the whole hero links to `/pulse`, which stays the instrument. |
| London-brain video hero | **Retired.** Removed from `page.tsx`; assets stay in the repo; the hero-mobile WIP on the main tree is acknowledged dead work. |
| Rebrand scope | **Front-door system.** Hero + nav behaviour on `/` + one footer line. Article pages, section fronts, `/pulse`, review UI: untouched. |
| PulseTeaser | **Deleted** (component + page section). Its hide-when-stale honesty moves into the hero stat line. |
| Rollout | **Sequenced.** Merge `feat/planet-pulse` first (after device pass); rebrand is a new branch `feat/night-edition` off main, with its own whole-branch review. |

## The experience (storyboard, approved)

1. **On load — full viewport, ink.** Serif masthead "Sandbox Daily" (Playfair
   900, italic *Daily* in Cortex Orange) with strapline THE PLANET,
   FACT-CHECKED DAILY. Below it the globe, slowly spinning, markers pulsing
   with live data. Under the globe one mono stat line:
   `● LIVE 80 events · hazard index 84` plus a serif aside ("— a quiet day,
   mostly"). A faint mono category whisper (`EQ 29 · FL 24 · TC 19 · WF 18`)
   sits beneath — kept from the Mission Control register, SanSan saw it and
   did not veto. Hint line at the viewport foot: DRAG TO TURN · TAP TO OPEN ·
   ↓ TODAY'S STORIES.
2. **The seam.** Globe dims and parallaxes up as the cream edition slides
   over — night into daylight. A "TODAY'S EDITION — day/date" masthead-lite
   marks the handover. Ticker, trending bar, article grid, subscribe strip
   continue exactly as built (teaser section removed).
3. **Footer.** Existing ink footer gains one line: `planet pulse: index 84`
   (live, links `/pulse`). This answers the parked "does /pulse join the
   footer" question. Ring closed: dark, cream, dark.

Riso dot-grain overlays the hero only, carrying the print identity into the
dark.

## Identity system

- **Nav on `/`:** transparent over the hero, wordmark hidden (the masthead does
  that job); gains its ink background + typewriter wordmark on scroll. All
  other routes: nav exactly as today. Nav links unchanged.
- **Footer:** the one live-index line added; everything else untouched.
- **Palette/type:** existing tokens only (ink, cream, Cortex Orange, Synaptic
  Green, Playfair/Source Serif/Plex Mono). No new colours, no new fonts.

## Architecture

- **`NightHero`** — server component + a thin client globe wrapper. Reuses
  `PulseGlobe` via a new **ambient mode prop**: current `compact spin`
  behaviour + drag-to-rotate + marker pulse, tap-to-select disabled.
  *Corrected at planning:* the engine disables all input in compact mode
  (engine.ts "picture, not an instrument" gate), so ambient requires a small
  engine option (`dragOnly`) — drag binds, pick/hover/zoom/keys stay off. The
  engine/UI split holds: the engine still knows only markers, never hazards.
- **Data:** `getPulseSnapshot()` as the page calls it today — same 600s cache
  shared with `/pulse`; zero new upstream requests.
- **Poster fallback:** one pre-rendered globe still captured from the real
  engine, committed as a static asset. Paints before hydration; covers JS-off
  and engine failure. The page never blanks (texture-loader lesson).
- **Removal:** London-brain `<video>` + scrim + eyebrow leave `page.tsx`;
  `PulseTeaser` deleted with no orphan imports.

## Layer-proof contract (the wars/unrest constraint)

Explicitly required by SanSan: future layers (war/conflict, civil unrest,
etc.) must slot in without redesign. Rules:

1. Markers colour by the event's **own** layer (as the teaser already does).
2. Stat line total = events across **all live layers**, layer-agnostic copy
   ("N live events", not "N hazards").
3. Index renders as **per-layer chips** — one today; a new layer brings its
   own. Never a combined single planet score (locked earlier: one hazard
   index cannot score a viral video).
4. Aside pool keyed to the **worst live band** across layers.
5. Category whisper = top categories by count across layers.
6. Filters/layer chips remain `/pulse`-only.
7. A synthetic **two-layer fixture** pins all of the above now, so layer 2 is
   a data change, not a redesign.

## Honesty rules

- Liveness travels with the data: hero reads `SourceStatus[]` per layer.
  Never inferred, never defaulted true.
- **All sources dead / snapshot stale:** hollow `◌ SNAPSHOT` pip +
  "last checked HH:MM"; markers grey at reduced opacity; index withheld;
  aside suppressed. Masthead + globe still render (textures are local).
- **Partial outage:** `● LIVE` stands; totals count only live sources; index
  only for live layers.
- **Zero events, feeds live:** a real reading — stated plainly ("nothing to
  report" aside class), never dressed as an error.
- Asides never fabricate: no band → no aside.
- The regression test that drives the real layer through a throwing fetch
  extends to the hero path.

## Testing

TDD, red-green-refactor. Lib tests at `src/lib/pulse/*.test.ts` (glob depth
constraint), component tests alongside existing ones. New units: ambient-mode
prop (no tap-select), stat-line derivation on the two-layer fixture, aside
selection incl. every suppression path, footer index line, teaser removal
(build + no orphan imports). Driven states: live / stale / partial /
reduced-motion / zero-events — none faked at the summary level. Production
build green before review. The pulse branch's outstanding device checks
(390px overlap, iPhone `dvh` + touch, reduced motion) stay the merge gate for
`feat/planet-pulse` (rollout step 1); the rebrand branch gets its own device
pass on the hero before its merge.

## Accessibility & motion

- Reduced motion: no auto-spin, no marker pulse; static lit globe; drag still
  works (user-initiated). Same layout, nothing hidden.
- Hero link carries the visible copy as its accessible name (WCAG 2.5.3 —
  no aria-label override; the teaser lesson).
- Hero must not create a touch scroll dead-zone: drag handling on the globe
  canvas only, not the full-bleed section (the `touch-action` lesson).

## Rollout

1. SanSan's device pass on `localhost:3005` → **merge `feat/planet-pulse`**
   (carries the hero/revision lineage; push = Vercel prod deploy). `/pulse` +
   teaser ship as built; teaser lives briefly, dies in the rebrand.
2. Branch **`feat/night-edition`** off main. Build per this spec. Whole-branch
   review (seam-defect rule) before its own merge.

## Out of scope

- Layer 2 sources (war/unrest geocoding + publishing the radar feed) — has
  its own recorded constraint in the registry.
- Homepage filters or HUD.
- Sitewide reskin (article pages, section fronts, review UI).
- Wordmark redesign — the masthead treatment uses the existing display face.

## v2 — Front Page composition (SanSan's review verdict, 2026-07-31)

SanSan reviewed the built v1 hero on device and redirected: the homepage
globe must be genuinely interactive ("show where the current events are"),
most hero text belongs on `/pulse`, and the page needs to be "a really nice
designed homepage" for the rebrand. Composition **B — Front Page** chosen
from three designed mockups (`.superpowers/brainstorm/63457-*/content/`).

**Decisions overturned from v1:**
- ~~Ambient + drag only~~ → the hero globe gains **hover/tap event cards**:
  hovering a pin pops a floating card — eyebrow is the category label alone
  (uppercased), not a "category · place" compound; the place lives in the
  title (`event.title` verbatim), matching the built model in
  `eventCardsById` — plus a **severity meter** (5-segment bar + band word + value).
  Severity words render only when `severityFrom === "magnitude"` (the
  provenance rule); category-baseline severities show the bar unlabelled.
  Touch: tap a pin shows the card, tap elsewhere dismisses; the card carries
  an "open in pulse →" link. Keyboard path remains the headlines + nav links
  (the accessible instrument is `/pulse`; the hero canvas stays decorative
  to AT).
- ~~Filters are /pulse-only~~ → **filter chips live on the homepage**:
  one real chip per registered layer (toggling a layer's markers), plus
  dashed "·soon" ghost chips for CONFLICT and UNREST so the layered future
  is visible from day one. Chips derive from the registry — layer 2 arrives
  as a data change, per the contract.
- ~~Full-size masthead centred over globe~~ → **split composition**: left
  column = masthead (reduced), strapline, the day's **top-3 headlines**
  colour-keyed by section, filter chips beneath; right = the globe **larger,
  bleeding off the right edge**. Live line (`● LIVE · N events`) bottom-right.
- Whisper, aside, and index chips **leave the homepage** (the aside retires;
  /pulse's HUD already carries index + categories). `deriveHeroStatus`
  remains the single authority — the hero simply consumes less of it.

**Unchanged from v1:** honesty rules (snapshot mode withholds everything;
liveness travels with data; open-tab aging tick), the layer-proof contract,
the night-to-daylight seam, nav-over-hero behaviour, footer index line,
poster fallback, all engine safety work.

## References studied

- earth.nullschool.net — instrument restraint, hidden chrome.
- github.com/globe — globe-as-brand-hero scale (register rejected).
- app.electricitymaps.com — dashboard register (rejected for the front door).
- Gap identified: nobody does "broadsheet nocturne" — a newspaper's night
  front page. That's the ownable register.

*Last updated: 2026-07-31*

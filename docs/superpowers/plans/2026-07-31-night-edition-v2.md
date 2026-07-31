# Night Edition v2 — Front Page Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the landing hero to the approved Front Page composition — masthead + top-3 headlines + filter chips left, larger right-bled globe with hover/tap event cards (severity meter) right — per the spec's v2 section.

**Architecture:** Pure card/chip models join `src/lib/pulse/hero.ts` (tested). The engine's `dragOnly` option (unshipped, single consumer) is replaced by `interaction: "full" | "none" | "ambient"` — ambient = drag + hover + tap-pick, no wheel/pinch/keys. One client component (`HeroFrontPage`) owns the interactive hero interior (client components still SSR); `NightHero` (server) feeds it serializable props. Spec: `docs/superpowers/specs/2026-07-31-night-edition-rebrand-design.md` §v2.

**Tech Stack:** unchanged (Next.js App Router, TS strict, node:test, canvas engine).

## Global Constraints

- Branch: continue on `feat/night-edition`. Commit only, never push. **Explicit `git add` paths always — the tree carries untracked pipeline output.**
- Lib tests at `src/lib/pulse/*.test.ts` exactly. TS strict, no `any`, named exports, no console.log, no Math.random/Date.now in derivations.
- Layer-proof: chips/cards derive from the snapshot's layers, never assume "hazards". Ghost chips are copy, not layers.
- Honesty: severity WORD renders only when `severityFrom === "magnitude"`; the meter bar always renders. Snapshot mode: no cards, chips disabled, markers dimmed (existing behaviour holds).
- Masthead copy verbatim: "Sandbox Daily" (italic Daily, orange), strapline "THE PLANET, FACT-CHECKED DAILY". Live line: `● LIVE` + `N events`. Ghost chips: `CONFLICT ·soon`, `UNREST ·soon`.
- Existing tokens/fonts only. CSS overrides that must beat Tailwind utilities go UNLAYERED; equal-specificity media-query overrides come later in source. **Any CSS fix is verified by rendered computed style (headless Chrome), never by grep.**
- Suite baseline 220. Commands: `npm run test:lib`, `npx tsc --noEmit`, `npm run lint` (7 pre-existing errors in untouched files), `npm run build`.

---

### Task 1: Engine `interaction` option replaces `dragOnly`

**Files:**
- Modify: `src/lib/pulse/globe-engine/engine.ts`
- Modify: `src/components/pulse/pulse-globe.tsx`

**Interfaces:**
- Consumes: existing engine options `{ compact?, dragOnly? }` (dragOnly added this branch, sole consumer is the ambient hero — replace it wholesale, no deprecation).
- Produces: engine option `interaction?: "full" | "none" | "ambient"` (default: `"none"` when `compact` else `"full"`). `PulseGlobe`'s `ambient` prop now maps to `{ compact: true, interaction: "ambient" }`. Ambient binds pointerdown/move/up/leave + pointercancel with drag AND the hover branch AND tap-pick; wheel/pinch/keyboard remain full-only. Task 2 wires `onHover`/`onPick` on the ambient globe — the "don't pass onHover" rule from v1 is superseded.

- [ ] **Step 1:** In `engine.ts`: replace the `dragOnly` field with `interaction` resolved in the constructor (`options.interaction ?? (options.compact ? "none" : "full")`). Rewrite `bindEvents()` guards: top gate `if (this.interaction === "none") return;`. Hover branch in pointermove and tap-pick in pointerup run for full AND ambient (delete the dragOnly guards there). The wheel/touchstart/touchmove/touchend/keydown section keeps a gate: `if (this.interaction !== "full") return;` before it. pointercancel stays for both.
- [ ] **Step 2:** In `pulse-globe.tsx`: construct with `{ compact: compact || ambient, interaction: ambient ? "ambient" : undefined }`. Keep ambient's `tabIndex -1`/`aria-hidden` (keyboard path is /pulse, per spec v2).
- [ ] **Step 3:** Verify: `npx tsc --noEmit && npm run lint && npm run test:lib` (220). Grep: `grep -rn "dragOnly" src/` → empty.
- [ ] **Step 4:** Commit: `git add src/lib/pulse/globe-engine/engine.ts src/components/pulse/pulse-globe.tsx` · `feat: engine interaction modes — ambient gains hover + tap-pick`

---

### Task 2: Card + chip models in the hero lib

**Files:**
- Modify: `src/lib/pulse/hero.ts`
- Test: `src/lib/pulse/hero.test.ts` (append; reuse existing fixtures)

**Interfaces:**
- Consumes: `LayerEvent`, `PulseSnapshot`, `CategoryMeta` from `./types`.
- Produces (Tasks 3–4 consume these exact shapes):

```ts
export interface EventCard {
  id: string;
  eyebrow: string;          // "EARTHQUAKE · <TITLE-CASE SOURCE REGION>" — category label uppercased · title uppercased? NO: eyebrow = category label uppercased; place = event.title
  title: string;            // event.title verbatim
  magnitude: string | null; // event.magnitude ?? null
  severity: number;         // 0..1
  severityWord: string | null; // band word ONLY when severityFrom === "magnitude", else null
  segments: number;         // 0..5 — Math.round(severity * 5)
  color: string;            // category colour from the OWNING layer
  url: string | null;
}
export const eventCardsById = (snapshot: PulseSnapshot): Map<string, EventCard>
// severityWord derivation: severity >= 0.75 "SEVERE", >= 0.5 "HIGH", >= 0.25 "ELEVATED", else "LOW" — only when severityFrom === "magnitude".

export interface LayerChip { id: string; label: string; live: boolean }
export const chipsFromLayers = (snapshot: PulseSnapshot): LayerChip[]  // one per snapshot layer, live flag per layer
export const GHOST_CHIPS = ["CONFLICT", "UNREST"] as const;            // copy, not layers
```

- [ ] **Step 1:** Failing tests (append to hero.test.ts, reuse `event`/`hazards`/`unrest`/`snap` fixtures): card for a magnitude event carries severityWord + segments + owning-layer colour; card for a category-baseline event (`severityFrom: "category"` or absent) has `severityWord: null` but still segments; events from BOTH layers present in the map keyed by id; `chipsFromLayers` returns one chip per layer with live flags; dead layer's events excluded from `eventCardsById` (mirrors the markers rule).
- [ ] **Step 2:** Run → fail. **Step 3:** Implement (pure, layer-agnostic — resolve category label/colour via the event's own layer exactly as `markersFromSnapshot` does). **Step 4:** Run → pass; full suite.
- [ ] **Step 5:** Commit: `git add src/lib/pulse/hero.ts src/lib/pulse/hero.test.ts` · `feat: event card + layer chip models for the interactive hero`

---

### Task 3: `HeroFrontPage` — split composition, headlines, hover/tap cards

**Files:**
- Create: `src/components/hero-front-page.tsx` (client — owns chips state, hover card state, globe)
- Modify: `src/components/night-hero.tsx` (server: derives props, renders masthead-column statics + `HeroFrontPage`)
- Delete: `src/components/night-hero-globe.tsx` (superseded — tap-to-open replaced by pick-driven cards; its pointer-slop nav dies, the card's "open in pulse →" link is the path)
- Modify: `src/app/page.tsx` (pass top-3 articles into `NightHero`)
- Modify: `src/app/globals.css` (the split-composition styles)

**Interfaces:**
- Consumes: `deriveHeroStatus`, `markersFromSnapshot`, `eventCardsById`, `chipsFromLayers`, `GHOST_CHIPS` (Tasks 1–2), `PulseGlobe` ambient with `onHover`/`onPick` (now supported), existing `NightHeroStat` client tick (keep for the live line), `getAllArticles` shape from `page.tsx` (`{ slug, section, title }` — check the real fields before writing).
- Produces: `NightHero({ snapshot, articles }: { snapshot: PulseSnapshot; articles: HeroArticle[] })` where `HeroArticle = { href: string; section: "news"|"tech"|"sport"|"features"; title: string }`; internal `HeroFrontPage` is not consumed elsewhere.

Layout (from the approved mock): `.night-hero` becomes a two-column grid — left: masthead (reduced, `clamp(2rem,4.5vw,3.2rem)`), strapline, top-3 headlines (section-colour keyed bar + title, linking to the article), chips row; right: globe container `width: min(52vw, 640px)` positioned to bleed off the right edge (`margin-right: calc(-1 * clamp(40px, 8vw, 120px))`), live line absolute bottom-right of the hero. Mobile (<720px): single column — masthead, globe (bleed right, smaller), headlines, chips; live line static under globe. Hint line dies (the page explains itself now); `↓ today's stories` moves into the live line.

Hover/tap behaviour: `onHover(id, x, y)` sets `{card: cards.get(id), x, y}` (null id clears); `onPick(id)` on touch/click sets the same sticky card (null dismisses); card renders absolutely inside the globe container, clamped to viewport edges (flip left when within 180px of right edge). Card: eyebrow (category label, mono, layer colour), title serif bold, magnitude line if present, severity meter — 5 segments filled per `segments`, `severityWord` + value only when non-null. "open in pulse →" link (real `<a href="/pulse">`). Chips: real chips toggle a `Set<string>` of hidden layer ids → markers filtered before `PulseGlobe`; ghost chips render dashed/disabled with `·soon`, `aria-disabled`, no handler. Snapshot mode: chips render disabled, no cards bind (cards map empty per Task 2).

- [ ] **Step 1:** Build `hero-front-page.tsx` + rework `night-hero.tsx` + `page.tsx` (pass `articles` — top 3 of the existing `getAllArticles()` slice, mapped to `HeroArticle`). Delete `night-hero-globe.tsx`; move its poster-under-canvas markup into `HeroFrontPage`'s globe container unchanged.
- [ ] **Step 2:** CSS per the layout block above — new rules only, tokens only, dvh where viewport-height matters, unlayered if a Tailwind utility must lose.
- [ ] **Step 3:** Verify: suite/tsc/lint; dev server 3006: homepage SSR contains masthead once, three headline links with correct hrefs, chips row (HAZARDS + two `·soon` ghosts), live line; `grep -rn "night-hero-globe" src/` → empty. Manual browser: hover pin → card follows, leaves → clears; tap pin on touch-emulation → sticky card; drag still rotates; page scrolls over globe.
- [ ] **Step 4:** Commit: `git add` the five named files · `feat: Front Page hero — split composition, headlines, hover event cards, layer chips`

---

### Task 4: Poster regeneration (marker-free) + composition polish

**Files:**
- Modify: `public/images/pulse-globe-poster.webp` (regenerate)
- Modify: `src/app/globals.css` (only if the rendered pass demands polish)

- [ ] **Step 1:** Recreate the temporary capture route (as Task 8 v1 did — same automation: headless Chrome + magick) but pass the globe NO markers (`markers={[]}`) — the poster is the planet, not stale build-day pins (final-review niggle, now fixed). Same 840×840 webp target. Delete the capture route after; verify it's gone before committing.
- [ ] **Step 2:** Rendered check of the assembled homepage (headless Chrome screenshot at 1440×900 and 390×844): masthead column and globe don't overlap, chips reachable, live line visible, no horizontal scroll at 390px. Attach both screenshots' paths in the report; fix any layout break found (CSS, rendered-verified).
- [ ] **Step 3:** Commit: `git add public/images/pulse-globe-poster.webp src/app/globals.css` · `feat: marker-free poster + front-page composition polish`

---

### Task 5: Whole-branch v2 verification

**Files:** none.

- [ ] **Step 1:** Cold: `rm -rf .next && npm run test:lib && npx tsc --noEmit && npm run lint && npm run build`; manifest still 600 on `/` + section fronts + slug samples.
- [ ] **Step 2:** Seams (dev server): homepage event count vs /api/pulse; footer index unchanged; /pulse full instrument unaffected by the engine interaction refactor (hover/pick/keys/wheel all still bind — this is THE regression risk of Task 1; verify by browser on /pulse: wheel zooms, keyboard rotates, markers pick); grep gates (`dragOnly`, `night-hero-globe`) empty; exactly one h1.
- [ ] **Step 3:** Honest-failure drill (all sources → unreachable, server restart): hero shows ◌ SNAPSHOT, no cards on hover, chips disabled, dimmed markers, footer line gone; revert cleanly.
- [ ] **Step 4:** No commit. Report evidence.

---

## Self-Review (write time)

- Spec-v2 coverage: composition → T3; hover cards + severity + provenance → T2/T3; homepage filters + ghosts → T2/T3; text reduction → T3 (whisper/aside removed by the rework); interactive engine → T1; poster niggle → T4; /pulse regression risk of the interaction refactor named → T5.
- Type consistency: `EventCard`/`LayerChip`/`eventCardsById`/`chipsFromLayers`/`GHOST_CHIPS` consistent across T2→T3; `interaction` option consistent T1→T3.
- Placeholders: none — every step names its files, shapes, and checks; the two "check real fields" notes point at specific files.

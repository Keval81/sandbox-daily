# Night Edition v3 — The Front Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reformat the homepage as a broadsheet front page (spec §v3): folio row (date · clock · London temp · filter chips), centred nameplate + edition stamp, full-width PRESS WIRE ticker, lead story + two-column standfirst, globe in a captioned plate frame, perforated fold into the cream inside pages.

**Architecture:** One new lib module (`src/lib/folio/`) for weather + folio derivations (TDD, honesty-gated like pulse sources). `HeroFrontPage` is restructured into the front-page body; folio row and nameplate are new server/client components above it. The ticker component relocates and restyles. All v2 globe machinery (cards, chips-toggling, one clock, spin-pause) is preserved — chips RELOCATE into the folio row but keep their existing state/behaviour contract.

**Tech Stack:** unchanged. New upstream: `https://api.open-meteo.com/v1/forecast?latitude=51.5072&longitude=-0.1276&current=temperature_2m` (keyless).

## Global Constraints

- Branch `feat/night-edition`; commit only, never push; **explicit `git add` paths** (untracked pipeline output in tree).
- Lib tests at `src/lib/folio/*.test.ts` (same one-level glob constraint — verify `npm run test:lib`'s glob covers `src/lib/folio/` the way it covers `src/lib/pulse/`; it is `src/lib/**/*.test.ts` quoted, which does — confirm by running).
- Honesty: weather rendered ONLY from a fresh successful fetch (cache ≤ 30 min); on failure the temp segment is omitted (date/clock stay). Never a placeholder, never stale beyond window. Clock is client-ticked from a server-seeded time (hydration-safe, same pattern as the hero clock).
- Copy verbatim: folio `THURSDAY 31 JULY 2026 · 14:22 · LONDON 21°C` format (uppercase day/date, 24h clock, `LONDON N°C`); stamp `№ <n> · PRINTED NIGHTLY · THE PLANET, FACT-CHECKED`; wire prefix `PRESS WIRE ▸`; plate caption `PLATE 1 — THE WORLD, LIVE & UNRETOUCHED`; fold kicker `INSIDE THE EDITION ▾`. Edition № = days since 2026-01-01 (date-derived, no fake serial), rendered as plain integer.
- Existing tokens/fonts only. CSS: unlayered overrides where Tailwind utilities must lose; media overrides later in source; **rendered computed-style verification for any CSS fix**.
- v2 interactivity contract untouched: hover/tap cards, severity meters, drag, spin-pause, one shared clock, snapshot/live honesty, layer-proof chips.
- Suite baseline 231. Gates: `npm run test:lib`, `npx tsc --noEmit`, `npm run lint` (7 pre-existing errors), `npm run build`.

---

### Task 1: Folio lib — weather fetch + folio model

**Files:**
- Create: `src/lib/folio/weather.ts`, `src/lib/folio/folio.ts`
- Test: `src/lib/folio/weather.test.ts`, `src/lib/folio/folio.test.ts`

**Interfaces (Task 2 consumes):**

```ts
// weather.ts
export interface WeatherReading { tempC: number; fetchedAt: string }
export const getLondonWeather = async (): Promise<WeatherReading | null>
// null = unavailable (fetch failed / non-ok / malformed / cache expired with no refresh).
// In-process cache 30 min (WEATHER_REVALIDATE_SECONDS = 1800), last-good NOT served
// beyond the window (weather ages fast; an hour-old temp is a lie).
// Injectable fetch for tests (same pattern as pulse layer tests — check how
// src/lib/pulse tests inject; mirror it).

// folio.ts
export interface FolioLine {
  dateLine: string;      // "THURSDAY 31 JULY 2026"
  clock: string;         // "14:22" — derived from a passed epoch, UTC+London handling below
  tempC: number | null;  // null = omit segment
  edition: number;       // days since 2026-01-01 (UTC), 1-based
}
export const deriveFolio = (nowEpochMs: number, weather: WeatherReading | null): FolioLine
```

- London time: use `Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", … })` for dateLine + clock — the repo already fought a TZ bug (GDACS `asUtc`); a TZ-proof test is REQUIRED (set `TZ=America/New_York` style env in test like the GDACS test does — find and mirror it).

- [ ] **Step 1:** Failing tests: dateLine/clock format from a fixed epoch (TZ-proof); edition number from known dates (2026-01-01 → 1; 2026-07-31 → 212); tempC passthrough + null when weather null; weather fetch happy path (injected fetch returning open-meteo shape `{current:{temperature_2m:21.4}}` → rounded int), failure paths (non-ok, malformed JSON, thrown) → null; cache window respected (second call within window = no second fetch; beyond window with failing fetch = null, NOT last-good).
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** Run → pass; `npm run test:lib` confirms the folio tests are picked up by the glob (count must rise — if not, STOP: glob gap, report).
- [ ] **Step 5:** Commit: `git add src/lib/folio/` · `feat: folio lib — London dateline, honest weather, edition number`

---

### Task 2: Folio row + nameplate + nav hide on `/`

**Files:**
- Create: `src/components/folio-row.tsx` (client — clock tick + chips slot), `src/components/nameplate.tsx` (server)
- Modify: `src/components/nav.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `deriveFolio`, `getLondonWeather` (via page → props), the chip renderer from `HeroFrontPage` (Task 4 moves chips here — for THIS task render the chips slot as `{children}` so Task 4 can pass the existing chip row through without duplicating it).
- Produces: `FolioRow({ seedEpochMs, weather, children })` — client, minute tick advancing the clock from the seed (same wall-clock pattern as the hero clock; the folio clock may read `Date.now()` inside the effect tick only, never in render); `Nameplate({ edition })` — server, verbatim copy.

- [ ] **Step 1:** Build both components per the storyboard: folio row = hairline-bottom strip, mono, `dateLine · clock · LONDON N°C` left (temp segment omitted when `tempC` null), chips slot right; nameplate = centred display wordmark (reuses masthead classes/scale from the current hero, which Task 4 will stop rendering on its own) + mono stamp line + double rule beneath.
- [ ] **Step 2:** Nav: on `/` pre-scroll hide the whole bar (links included — `sd-nav--overlay` gains `visibility:hidden` or renders links only when solid; keep the element mounted for the scroll listener; keyboard users get the links back on scroll or via footer — note a11y tradeoff in a comment). Other routes unchanged.
- [ ] **Step 3:** Gates + curl: `/news` nav unchanged; `/` server HTML contains folio strings + nameplate + no visible nav links pre-scroll. Commit: `feat: folio row, broadsheet nameplate; front page owns its own top edge`

---

### Task 3: PRESS WIRE promotion

**Files:**
- Modify: `src/components/breaking-ticker.tsx` (restyle variant), `src/app/page.tsx` (relocate), `src/app/globals.css`

- [ ] **Step 1:** Read `breaking-ticker.tsx` first. Add a `wire` variant prop (or class): full-width Cortex Orange strip, mono, `PRESS WIRE ▸` prefix, larger type than the old ticker, marquee behaviour preserved if it exists (respect reduced motion as the component already does — verify it does; if not, add the guard).
- [ ] **Step 2:** `page.tsx`: ticker renders inside the front-page stack (under the nameplate, per storyboard) and is REMOVED from its old below-hero slot. The old ticker styling remains for any other consumers (grep for usages first).
- [ ] **Step 3:** Gates + curl (`PRESS WIRE ▸` present exactly once on `/`). Commit: `feat: the ticker becomes the PRESS WIRE — full-width, promoted to the front page`

---

### Task 4: Front-page body — lead + standfirst columns + plate frame

**Files:**
- Modify: `src/components/hero-front-page.tsx`, `src/components/night-hero.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: Tasks 1–3 components; existing `HeroArticle` prop (extend: the lead needs `standfirst` — read how article standfirsts are stored (`src/components/article-standfirst.tsx` + articles lib) and pass the lead's standfirst text through `NightHero`'s props).
- Produces: the assembled front page: `NightHero` renders folio row (chips passed in) → nameplate → wire → body grid (lead left: kicker `THE LEAD`, headline, standfirst in `column-count:2` with `column-rule`, then two colour-keyed headlines; globe right inside `.plate-frame` — hairline border, caption tab `PLATE 1 — THE WORLD, LIVE & UNRETOUCHED`, live line beneath) → perforation seam. Cream section gains kicker `INSIDE THE EDITION ▾` above the grid.

- [ ] **Step 1:** Restructure — chips move from the left column into the folio row slot (STATE stays in `HeroFrontPage`; lift the chips JSX up via the children slot or lift state to a shared client parent — keep ONE owner of `hiddenLayers` and the card/clock state; simplest correct: `HeroFrontPage` renders `FolioRow` itself at its top, passing chips as children — then the whole front page above the fold is one client component and Task 2's server/client split note is amended in the report).
- [ ] **Step 2:** The masthead inside the old left column dies (nameplate owns it now); lead + standfirst + two headlines per storyboard; plate frame + caption + live line; perforation (`border-top: 2px dashed`) + kicker in the cream section (`page.tsx`).
- [ ] **Step 3:** Height budget: the front page above the fold should FIT a 900px-tall desktop viewport without scroll-trap — verify rendered at 1440×900 and 1280×800; mobile (≤899px) stacks: folio (chips wrap below the dateline), nameplate, wire, globe plate, lead, headlines — verify 390×844. Screenshots required.
- [ ] **Step 4:** Full gates + interactivity regression in the rig (hover card, tap sticky, chip toggle from the FOLIO row now, drag, spin-pause). Commit: `feat: the front page — lead, standfirst columns, plate-framed globe, perforated fold`

---

### Task 5: Whole-branch v3 verification

**Files:** none. No commits.

- [ ] **Step 1:** Cold gates (`rm -rf .next`, suite ≥ 231 + folio tests, tsc, lint baseline, build; manifest 600s spot-checks hold).
- [ ] **Step 2:** Seams (dev server): folio temp omission drill (point the weather URL at an unreachable host — temp segment gone, date/clock/chips intact; revert clean); pulse honest-failure drill still passes with the chips in the folio row (snapshot mode disables them there); `PRESS WIRE ▸` once; one `<h1>`; v2 grep gates still empty; /pulse untouched.
- [ ] **Step 3:** Rendered pass 1440×900 + 390×844 screenshots for the report.

---

## Self-Review (write time)

- Spec §v3 coverage: folio row → T1/T2; nameplate/stamp → T2; wire → T3; body/plate/fold → T4; nav hide → T2; weather honesty → T1+T5 drill; chips relocation preserving contract → T4.
- Type consistency: `WeatherReading`/`FolioLine`/`deriveFolio`/`getLondonWeather` T1→T2→T4; chips-as-children slot T2→T4.
- Known tension recorded: T2 builds `FolioRow` with a children slot; T4 decides the final client-tree shape and may fold `FolioRow` into the client parent — the slot contract keeps both valid.

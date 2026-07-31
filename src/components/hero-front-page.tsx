"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import Link from "next/link";
import { PulseGlobe } from "@/components/pulse/pulse-globe";
import { formatStamp } from "@/components/pulse/format";
import { FolioRow } from "@/components/folio-row";
import { BreakingTicker } from "@/components/breaking-ticker";
import {
  deriveHeroStatus,
  markersFromSnapshot,
  eventCardsById,
  chipsFromLayers,
  GHOST_CHIPS,
} from "@/lib/pulse/hero";
import type { Marker, PulseSnapshot } from "@/lib/pulse/types";
import type { WeatherReading } from "@/lib/folio/weather";
import type { Vertical } from "@/lib/types";

export interface HeroArticle {
  href: string;
  section: Vertical;
  title: string;
  /** Only read for the lead (index 0 of `articles`) — the plain-English dek
   *  set in two columns beneath the lead headline. See
   *  article-standfirst.tsx / src/lib/articles.ts for how it's stored
   *  upstream; page.tsx is what decides only the lead carries one through. */
  standfirst?: string;
}

const SECTION_COLOR: Record<Vertical, string> = {
  news: "var(--color-orange)",
  tech: "var(--color-cream)",
  sport: "var(--color-accent)",
  features: "var(--color-orange)",
};

// The card's own footprint (globals.css: `.night-hero-card { width: min(78vw, 220px); }`,
// offset 12px from the pin) plus a small viewport margin. The clamp below is
// viewport-relative, not container-relative — a superset of what the
// container alone would guarantee: the globe now stays fully inside
// .plate-frame (Task 4 removed the old bleed-past-the-viewport composition),
// but a card drawn beside a pin near the frame's edge can still extend past
// the CONTAINER's own bounds into the lead column beside it. That's
// harmless (nothing there clips it, it just visually overlaps), whereas
// under-clamping against the real viewport edge would let a card run off
// the actual screen — so the viewport, not the container, stays the
// correct thing to clamp against.
const CARD_MAX_WIDTH_PX = 220;
const CARD_WIDTH_VW_FRACTION = 0.78;
const CARD_OFFSET_PX = 12;
const VIEWPORT_EDGE_MARGIN_PX = 8;
// Best-effort estimate, not measured: the card's content is dynamic (title
// wraps, magnitude line is optional), so this is a defensive upper bound for
// the bottom-clamp, not a precise height. Generous enough to cover a 2-line
// title + magnitude + meter + link without under-clamping.
const CARD_HEIGHT_ESTIMATE_PX = 180;
const CARD_VERTICAL_MARGIN_PX = 8;

interface Anchor {
  id: string;
  x: number;
  y: number;
  /** Container-local snapshot, for positioning math relative to
   *  .night-hero-planet (the card's actual CSS containing block — pure
   *  container geometry, independent of where the container itself sits
   *  on the page). */
  containerHeight: number;
  /** Viewport-relative X of the pin at the moment this anchor was set — the
   *  edge-flip decision (Important 1) has to compare against the true
   *  viewport bounds, not just the container's, since the card drawn beside
   *  the pin can be wider than the room left inside the container (it may
   *  spill into the lead column beside it — harmless — but must never spill
   *  off the actual screen edge). */
  viewportX: number;
}

/**
 * The front-page client root (Task 4 restructure). Owns every piece of front-
 * page state — clock, hover/sticky cards, chip toggles — in one place, per
 * the controller's "ONE client owner" decision. `nameplate` arrives as an
 * already-rendered ReactNode prop from NightHero (server) because Nameplate
 * itself IS a server component — a client component can't render a server
 * component inline, so this is the standard Next "pass server output as
 * children/props" pattern. BreakingTicker, by contrast, is a Client
 * Component ("use client" in breaking-ticker.tsx) — there's no boundary to
 * cross, so this file imports and renders it directly off the plain
 * `wireHeadlines` string array, the same way it renders everything else.
 */
export function HeroFrontPage({
  snapshot,
  articles,
  weather,
  seedEpochMs,
  folioSeedEpochMs,
  nameplate,
  wireHeadlines,
}: {
  snapshot: PulseSnapshot;
  articles: HeroArticle[];
  weather: WeatherReading | null;
  seedEpochMs: number;
  /** Wall-clock seed for FolioRow only — deliberately NOT the same value as
   *  `seedEpochMs` above. See the two-seeds-two-jobs note in night-hero.tsx
   *  (Important 1 fix): this one is NightHero's `wallEpochMs`
   *  (`Date.now()`), `seedEpochMs` is its `dataEpochMs`
   *  (`Date.parse(snapshot.generatedAt)`). */
  folioSeedEpochMs: number;
  nameplate: ReactNode;
  wireHeadlines: string[];
}) {
  const globeRef = useRef<HTMLDivElement>(null);
  // Fallback anchor for a touch tap that never fired a preceding hover — a
  // stationary tap on a touchscreen goes pointerdown -> pointerup with no
  // pointermove in between, so the engine's onHover (which is what actually
  // carries a position) never runs. onPick only ever hands back an id. This
  // ref is *my* own pointer read on the wrapping div (native listeners on the
  // canvas and this div's own listeners both see every event; neither calls
  // stopPropagation, so they coexist) — it's the only way to have a position
  // to fall back to when hover didn't already supply one.
  //
  // Only bound to pointerdown, not pointermove: this fallback is only ever
  // consulted for a tap (pointerdown -> pointerup with no hover in between),
  // so the tap's own down-coordinate IS the position — there is no need to
  // keep re-reading getBoundingClientRect() on every pointermove just to keep
  // a value this path never uses updated.
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const trackPointerOnDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    lastPointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  // Data clock: the live line and the event cards must age together, or a
  // tab left open could keep showing a "live" card over a hero whose stat
  // line has already flipped to Snapshot. Mirrors the retired hero stat
  // clock's seed/tick pattern (seeded from generatedAt so server and first
  // client render agree; deferred setTimeout before the wall clock takes over).
  // Seeded from `seedEpochMs` — NightHero's `dataEpochMs`,
  // `Date.parse(snapshot.generatedAt)` — deliberately, not the wall clock:
  // this is the one clock on the front page that has to stay honestly tied
  // to when the snapshot was actually generated, so it can keep saying
  // SNAPSHOT truthfully under pipeline starvation. FolioRow below gets its
  // own, separate wall-clock seed (`folioSeedEpochMs`) — see the
  // two-seeds-two-jobs note in night-hero.tsx (Important 1 fix).
  const [now, setNow] = useState(() => seedEpochMs);
  useEffect(() => {
    // Deferred rather than synchronous: the first client render has to match
    // the server HTML, and only then does the wall clock take over.
    const sync = () => setNow(Date.now());
    const first = setTimeout(sync, 0);
    const id = setInterval(sync, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const status = useMemo(() => deriveHeroStatus(snapshot, now), [snapshot, now]);
  const cards = useMemo(() => eventCardsById(snapshot, now), [snapshot, now]);
  const chips = useMemo(() => chipsFromLayers(snapshot), [snapshot]);

  const allMarkers = useMemo(
    () => markersFromSnapshot(snapshot, status.mode === "snapshot"),
    [snapshot, status.mode]
  );

  // event.id -> layer, so a chip toggle can filter markers by layer without
  // the globe engine (or Marker itself) ever learning what a "layer" is.
  const layerOf = useMemo(
    () => new Map(snapshot.events.map((e) => [e.id, e.layer])),
    [snapshot.events]
  );

  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(() => new Set());
  const markers: Marker[] = useMemo(() => {
    // Chips go non-interactive in snapshot mode, so a layer hidden while live
    // has no way back — showing every dimmed marker regardless of a prior
    // toggle is the only honest reading once the chips can't be un-toggled.
    if (status.mode === "snapshot" || hiddenLayers.size === 0) return allMarkers;
    return allMarkers.filter((m) => !hiddenLayers.has(layerOf.get(m.id) ?? ""));
  }, [allMarkers, hiddenLayers, layerOf, status.mode]);

  const [hover, setHover] = useState<Anchor | null>(null);
  const [sticky, setSticky] = useState<Anchor | null>(null);
  const active = sticky ?? hover;
  const activeCard = active ? cards.get(active.id) : undefined;

  // Repeated nulls, deduped: the engine emits hover on every pointermove.
  // Returning the previous object bails the re-render out rather than
  // storming React on every mouse-move frame (mirrors pulse-client.tsx).
  const handleHover = useCallback((id: string | null, x: number, y: number) => {
    // Read here, in the event handler — not in the render body, where
    // reading a ref's .current is disallowed (react-hooks/refs).
    const rect = globeRef.current?.getBoundingClientRect();
    const containerHeight = rect?.height ?? 0;
    const viewportX = (rect?.left ?? 0) + x;
    setHover((prev) => {
      if (id === null) return prev === null ? prev : null;
      if (prev && prev.id === id && prev.x === x && prev.y === y) return prev;
      return { id, x, y, containerHeight, viewportX };
    });
  }, []);

  const handlePick = useCallback(
    (id: string | null) => {
      if (id === null) {
        setSticky(null);
        return;
      }
      const rect = globeRef.current?.getBoundingClientRect();
      const containerHeight = rect?.height ?? 0;
      const pos = hover && hover.id === id ? { x: hover.x, y: hover.y } : lastPointerRef.current;
      const viewportX = (rect?.left ?? 0) + pos.x;
      setSticky({ id, x: pos.x, y: pos.y, containerHeight, viewportX });
    },
    [hover]
  );

  const toggleLayer = useCallback((id: string) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // A binary left/right flip can't satisfy both viewport edges once the card
  // is a large fraction of the viewport (at 390px the card is 56% of it) —
  // there's a band near the right edge where "flip left" itself overshoots
  // the LEFT edge. Clamp instead: pick a starting side (mirrors the old flip
  // logic — prefer beside the pin, to its right unless that would overflow),
  // then clamp the result into [8, innerWidth - cardWidth - 8] so it can
  // never leave the viewport on EITHER side. On a narrow phone this means the
  // card parks at a stable x rather than tracking the pin exactly — correct,
  // not a compromise: the alternative is a card partly off-screen.
  //
  // cardWidth is computed from the same formula as the CSS
  // (`width: min(78vw, 220px)`) rather than hardcoded, so the two can't drift
  // apart. document.documentElement.clientWidth (not window.innerWidth) so a
  // classic scrollbar (~15px, non-macOS) is excluded from the viewport width
  // used for the clamp — innerWidth includes the scrollbar's own real estate,
  // which would let the clamp place a card 15px further right than the
  // visible viewport actually allows, eating into the 8px margin. Only
  // touched once `active` is truthy, which requires a prior user interaction
  // (post-mount) — never reached during SSR/first render.
  let cardStyle: { top: number; left: number } | undefined;
  if (active) {
    const viewportWidth = document.documentElement.clientWidth;
    const cardWidth = Math.min(viewportWidth * CARD_WIDTH_VW_FRACTION, CARD_MAX_WIDTH_PX);
    const rightTight =
      active.viewportX + cardWidth + CARD_OFFSET_PX > viewportWidth - VIEWPORT_EDGE_MARGIN_PX;
    const desiredViewportLeft = rightTight
      ? active.viewportX - cardWidth - CARD_OFFSET_PX
      : active.viewportX + CARD_OFFSET_PX;
    const clampedViewportLeft = Math.min(
      Math.max(desiredViewportLeft, VIEWPORT_EDGE_MARGIN_PX),
      viewportWidth - cardWidth - VIEWPORT_EDGE_MARGIN_PX
    );
    // Convert back to container-local: the card's actual CSS containing
    // block is .night-hero-planet (position: absolute resolves against it),
    // not the viewport. containerLeft is derived from values already on the
    // anchor (viewportX = containerLeft + x) rather than re-reading a ref.
    const containerLeft = active.viewportX - active.x;

    const top = Math.min(
      Math.max(CARD_VERTICAL_MARGIN_PX, active.y - CARD_VERTICAL_MARGIN_PX),
      Math.max(
        CARD_VERTICAL_MARGIN_PX,
        active.containerHeight - CARD_HEIGHT_ESTIMATE_PX - CARD_VERTICAL_MARGIN_PX
      )
    );

    cardStyle = { top, left: clampedViewportLeft - containerLeft };
  }

  // Front-page body split: articles[0] is THE LEAD (headline + standfirst),
  // the rest render as the existing colour-keyed headline list underneath it
  // — same three-article shape page.tsx has always sent, just read
  // positionally instead of as one flat list.
  const [lead, ...restArticles] = articles;

  return (
    <>
      <FolioRow seedEpochMs={folioSeedEpochMs} weather={weather}>
        <div className="night-hero-chips" role="group" aria-label="Layers">
          {chips.map((chip) =>
            status.mode === "snapshot" || !chip.live ? (
              <span key={chip.id} className="night-hero-chip" aria-disabled="true">
                {chip.label}
              </span>
            ) : (
              <button
                key={chip.id}
                type="button"
                className="night-hero-chip"
                aria-pressed={!hiddenLayers.has(chip.id)}
                onClick={() => {
                  const hiding = !hiddenLayers.has(chip.id);
                  toggleLayer(chip.id);
                  if (hiding && active && layerOf.get(active.id) === chip.id) {
                    setHover(null);
                    setSticky(null);
                  }
                }}
              >
                {chip.label}
              </button>
            )
          )}
          {GHOST_CHIPS.map((label) => (
            <span key={label} className="night-hero-chip night-hero-chip--ghost" aria-disabled="true">
              {label} <span className="night-hero-chip-soon">·soon</span>
            </span>
          ))}
        </div>
      </FolioRow>

      {nameplate}
      <BreakingTicker headlines={wireHeadlines} wire />

      <div className="night-hero-body">
        <div className="night-hero-lead-col">
          {lead && (
            <>
              <p className="night-hero-kicker">THE LEAD</p>
              <h2 className="night-hero-lead-headline">
                <Link href={lead.href}>{lead.title}</Link>
              </h2>
              {lead.standfirst && (
                <div className="night-hero-standfirst">{lead.standfirst}</div>
              )}
            </>
          )}

          <ul className="night-hero-headlines">
            {restArticles.map((article) => (
              <li key={article.href}>
                <Link href={article.href} className="night-hero-headline">
                  <span
                    className="night-hero-headline-bar"
                    style={{ background: SECTION_COLOR[article.section] }}
                    aria-hidden
                  />
                  {article.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="night-hero-plate-col">
          <div className="plate-frame">
            <span className="plate-frame-caption">
              PLATE 1 — THE WORLD, LIVE &amp; UNRETOUCHED
            </span>

            <div className="night-hero-planet" ref={globeRef} onPointerDown={trackPointerOnDown}>
              <img src="/images/pulse-globe-poster.webp" alt="" className="night-hero-poster" />
              <PulseGlobe
                markers={markers}
                ambient
                spin={!activeCard}
                onHover={handleHover}
                onPick={handlePick}
              />

              {/* Persistent live region: a node that mounts AND gains content in the
                  same DOM update is not reliably announced (most screen readers need
                  the aria-live element to already exist before its content changes).
                  The wrapper always stays in the DOM; only the card inside it is
                  conditional. */}
              <div className="night-hero-card-region" aria-live="polite">
                {activeCard && (
                  <div
                    className="night-hero-card"
                    data-sticky={sticky ? "true" : undefined}
                    style={{ ...cardStyle, borderLeftColor: activeCard.color }}
                  >
                    {sticky && (
                      <button
                        type="button"
                        className="night-hero-card-close"
                        aria-label="Close"
                        onClick={() => setSticky(null)}
                      >
                        ✕
                      </button>
                    )}
                    <span className="night-hero-card-eyebrow" style={{ color: activeCard.color }}>
                      {activeCard.eyebrow}
                    </span>
                    <p className="night-hero-card-title">{activeCard.title}</p>
                    {activeCard.magnitude && (
                      <p className="night-hero-card-magnitude">{activeCard.magnitude}</p>
                    )}
                    <div className="night-hero-card-meter" aria-hidden="true">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={i}
                          className="night-hero-card-seg"
                          style={i < activeCard.segments ? { background: activeCard.color } : undefined}
                        />
                      ))}
                      {activeCard.severityWord && (
                        <span className="night-hero-card-severity">
                          {activeCard.severityWord} {activeCard.severity.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <Link href="/pulse" className="night-hero-card-link">
                      open in pulse →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="night-hero-live">
            {status.mode === "live" ? (
              <p className="night-hero-live-line">
                <span className="night-hero-pip" data-live>● LIVE</span>{" "}
                <span className="font-mono">{status.totalEvents} events</span>
                {" · "}
                <span>↓ today&rsquo;s stories</span>
              </p>
            ) : (
              <p className="night-hero-live-line">
                <span className="night-hero-pip">◌ SNAPSHOT</span>{" "}
                <span className="font-mono">last checked {formatStamp(status.generatedAt)}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

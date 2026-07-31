"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { PulseGlobe } from "@/components/pulse/pulse-globe";
import { formatStamp } from "@/components/pulse/format";
import {
  deriveHeroStatus,
  markersFromSnapshot,
  eventCardsById,
  chipsFromLayers,
  GHOST_CHIPS,
} from "@/lib/pulse/hero";
import type { Marker, PulseSnapshot } from "@/lib/pulse/types";
import type { Vertical } from "@/lib/types";

export interface HeroArticle {
  href: string;
  section: Vertical;
  title: string;
}

const SECTION_COLOR: Record<Vertical, string> = {
  news: "var(--color-orange)",
  tech: "var(--color-cream)",
  sport: "var(--color-accent)",
  features: "var(--color-orange)",
};

/** Matches the brief's clamp: a card whose pin sits within this many px of the
 *  globe container's right edge renders to the LEFT of the point instead, or
 *  it would draw itself straight off the bled (and clipped) edge. */
const EDGE_CLEARANCE_PX = 180;

interface Anchor {
  id: string;
  x: number;
  y: number;
  /** Snapshot of the globe container's width at the moment this anchor was
   *  set. Read from the ref inside the event handler that produced it — refs
   *  may not be read during render (react-hooks/refs), so the edge-clamp math
   *  below works off this stored number instead of a live ref read. */
  containerWidth: number;
}

export function HeroFrontPage({ snapshot, articles }: { snapshot: PulseSnapshot; articles: HeroArticle[] }) {
  const globeRef = useRef<HTMLDivElement>(null);
  // Fallback anchor for a touch tap that never fired a preceding hover — a
  // stationary tap on a touchscreen goes pointerdown -> pointerup with no
  // pointermove in between, so the engine's onHover (which is what actually
  // carries a position) never runs. onPick only ever hands back an id. This
  // ref is *my* own pointer read on the wrapping div (native listeners on the
  // canvas and this div's own listeners both see every event; neither calls
  // stopPropagation, so they coexist) — it's the only way to have a position
  // to fall back to when hover didn't already supply one.
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const trackPointer = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    lastPointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  // Shared clock: the live line and the event cards must age together, or a
  // tab left open could keep showing a "live" card over a hero whose stat
  // line has already flipped to Snapshot. Mirrors night-hero-stat's old
  // seed/tick pattern (seeded from generatedAt so server and first client
  // render agree; deferred setTimeout before the wall clock takes over).
  const [now, setNow] = useState(() => Date.parse(snapshot.generatedAt));
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
  const markers: Marker[] = useMemo(
    () =>
      hiddenLayers.size === 0
        ? allMarkers
        : allMarkers.filter((m) => !hiddenLayers.has(layerOf.get(m.id) ?? "")),
    [allMarkers, hiddenLayers, layerOf]
  );

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
    const containerWidth = globeRef.current?.clientWidth ?? 0;
    setHover((prev) => {
      if (id === null) return prev === null ? prev : null;
      if (prev && prev.id === id && prev.x === x && prev.y === y) return prev;
      return { id, x, y, containerWidth };
    });
  }, []);

  const handlePick = useCallback(
    (id: string | null) => {
      if (id === null) {
        setSticky(null);
        return;
      }
      const containerWidth = globeRef.current?.clientWidth ?? 0;
      const pos = hover && hover.id === id ? { x: hover.x, y: hover.y } : lastPointerRef.current;
      setSticky({ id, x: pos.x, y: pos.y, containerWidth });
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

  const flip = active ? active.x > active.containerWidth - EDGE_CLEARANCE_PX : false;
  const cardStyle = active
    ? flip
      ? { top: Math.max(8, active.y - 8), right: Math.max(8, active.containerWidth - active.x + 12) }
      : { top: Math.max(8, active.y - 8), left: active.x + 12 }
    : undefined;

  return (
    <>
      <div className="night-hero-mast">
        <h1 className="night-hero-masthead">
          Sandbox <em>Daily</em>
        </h1>
        <p className="night-hero-strapline">THE PLANET, FACT-CHECKED DAILY</p>
      </div>

      <div
        className="night-hero-planet"
        ref={globeRef}
        onPointerDown={trackPointer}
        onPointerMove={trackPointer}
      >
        <img src="/images/pulse-globe-poster.webp" alt="" className="night-hero-poster" />
        <PulseGlobe markers={markers} ambient spin onHover={handleHover} onPick={handlePick} />

        {activeCard && (
          <div
            className="night-hero-card"
            aria-live="polite"
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

      <div className="night-hero-rest">
        <ul className="night-hero-headlines">
          {articles.map((article) => (
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

        <div className="night-hero-chips" role="group" aria-label="Layers">
          {chips.map((chip) =>
            status.mode === "snapshot" ? (
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
      </div>
    </>
  );
}

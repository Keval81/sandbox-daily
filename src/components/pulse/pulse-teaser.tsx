"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PulseGlobe } from "./pulse-globe";
import { everySourceDead } from "@/lib/pulse/freshness";
import type { Marker, PulseSnapshot } from "@/lib/pulse/types";

/** 6-digit hex, deliberately: the engine appends an alpha pair to marker colours. */
const FALLBACK_COLOR = "#98989D";

export function PulseTeaser({ snapshot }: { snapshot: PulseSnapshot }) {
  const layer = snapshot.layers[0];

  // Hooks run before any early return below, so this stays unconditional even
  // on the dead-sources / stale path where the component ends up rendering nothing.
  const markers: Marker[] = useMemo(
    () =>
      snapshot.events.map((e) => ({
        id: e.id,
        lat: e.lat,
        lon: e.lon,
        color: layer?.categories[e.category]?.color ?? FALLBACK_COLOR,
        weight: e.severity,
      })),
    [snapshot.events, layer]
  );

  // The teaser has no HUD to say "Snapshot" the way /pulse does, so it has no
  // honest way to show numbers it doesn't currently trust. A stale snapshot
  // (all sources down, served from last-good cache) or a live snapshot where
  // every source is dead right now both mean "we don't actually know" — the
  // safer move is not to advertise the feature with data that might be wrong,
  // not to invent a second, smaller HUD to caveat it.
  if (snapshot.stale || everySourceDead(snapshot.layers)) return null;

  // Only a live layer's index counts. buildSnapshot already withholds the index
  // from a dead layer, and everySourceDead above rules out a total outage for
  // the single registered layer today — but this guard is what encodes the rule
  // per layer, the same one PulseClient applies to the full HUD.
  const hazard = layer?.live ? layer.index : null;

  const hasEvents = snapshot.events.length > 0;

  return (
    // No aria-label: the visible copy (count, index, "Open the globe →") is
    // exactly what the accessible name should be — a static override here
    // would swallow it and defeat the reason plain text was chosen over the
    // gauge component in the first place (WCAG 2.5.3 Label in Name).
    <Link href="/pulse" className="pulse-teaser">
      <div className="pulse-teaser-globe">
        <PulseGlobe markers={markers} compact spin />
      </div>
      <div className="pulse-teaser-copy">
        <p className="pulse-teaser-eyebrow">Planet Pulse</p>
        {hasEvents ? (
          <p className="pulse-teaser-stat">
            <span className="font-mono">{snapshot.events.length}</span> active hazards
          </p>
        ) : (
          // Sources are live here (the dead-source path already returned above),
          // so "nothing open" is a real reading, not a gap dressed up as calm.
          <p className="pulse-teaser-stat">No active hazards reported</p>
        )}
        {hazard && (
          <p className="pulse-teaser-stat">
            Hazard index <span className="font-mono">{hazard.score}</span>
            <span style={{ color: hazard.color }}> {hazard.band}</span>
          </p>
        )}
        <span className="pulse-teaser-cta">Open the globe →</span>
      </div>
    </Link>
  );
}

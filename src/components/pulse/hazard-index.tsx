"use client";

import type { CSSProperties } from "react";
import type { LayerIndex } from "@/lib/pulse/types";

interface HazardIndexProps {
  index: LayerIndex;
  eventCount: number;
  wildfires: number;
}

/**
 * The score is printed once and never animated. A JS count-up seeded with the
 * true value flashes it, drops to ~0 on the first frame and climbs back — the
 * number appears to be wrong twice before it settles. The arc sweeps instead, as
 * a CSS animation over the registered --pulse-pct property, which reduced motion
 * switches off without the number ever changing.
 */
export function HazardIndex({ index, eventCount, wildfires }: HazardIndexProps) {
  return (
    <div className="pulse-index">
      <div
        className="pulse-gauge"
        role="img"
        aria-label={`Global hazard index ${index.score} out of 100 — ${index.band}`}
        // Custom properties are not in CSSProperties; the cast is the standard
        // escape hatch and keeps the values typed as a number/string.
        style={{ "--pulse-pct": index.score, "--pulse-band": index.color } as CSSProperties}
      >
        <span className="pulse-gauge-num">
          <b className="font-mono">{index.score}</b>
          <small>/ 100</small>
        </span>
      </div>

      <div className="pulse-index-meta">
        <span className="pulse-label">Global hazard index</span>
        <strong className="pulse-band" style={{ color: index.color }}>
          {index.band}
        </strong>
        <span className="pulse-index-sub">
          <span className="font-mono">{eventCount}</span> events ·{" "}
          <span className="font-mono">{wildfires}</span> wildfires
        </span>
      </div>
    </div>
  );
}

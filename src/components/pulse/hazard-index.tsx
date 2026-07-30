"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { LayerIndex } from "@/lib/pulse/types";

interface HazardIndexProps {
  index: LayerIndex;
  eventCount: number;
  wildfires: number;
}

const COUNT_UP_MS = 700;

export function HazardIndex({ index, eventCount, wildfires }: HazardIndexProps) {
  // Starts at the true score so the server HTML, the first client render and a
  // JavaScript-less reader all show the real number; the count-up is an
  // enhancement layered on after mount, never the source of truth.
  const [display, setDisplay] = useState(index.score);

  useEffect(() => {
    // Reduced motion jumps straight to the end of the same curve rather than
    // taking a separate branch, so the two paths can never disagree on the
    // number they land on.
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = reduced ? 1 : Math.min(1, (t - start) / COUNT_UP_MS);
      setDisplay(Math.round(index.score * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [index.score]);

  return (
    <div className="pulse-index">
      <div
        className="pulse-gauge"
        role="img"
        aria-label={`Global hazard index ${index.score} out of 100 — ${index.band}`}
        // Custom properties are not in CSSProperties; the cast is the standard
        // escape hatch and keeps the value typed as a number/string.
        style={{ "--pulse-pct": display, "--pulse-band": index.color } as CSSProperties}
      >
        <span className="pulse-gauge-num">
          <b className="font-mono">{display}</b>
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

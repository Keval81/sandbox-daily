"use client";

import { LiveIndicator } from "./live-indicator";

interface BreakingTickerProps {
  headlines: string[];
  /** Front-page PRESS WIRE treatment: full-width orange strip, larger type,
   *  static "PRESS WIRE ▸" label in place of the Live dot. Other consumers
   *  (e.g. /news) omit this and keep the original below-hero styling. */
  wire?: boolean;
}

export function BreakingTicker({ headlines, wire = false }: BreakingTickerProps) {
  const text = headlines.join(" · ");

  if (wire) {
    return (
      <div className="breaking-ticker--wire py-4 overflow-hidden">
        <div className="mx-auto max-w-[1440px] px-6 flex items-center gap-4">
          {/* Rendered once, outside the marquee's duplicated `{text} · {text}`
             loop trick below — keeps "PRESS WIRE ▸" appearing exactly once
             in the DOM regardless of the seamless-scroll duplication. */}
          <span className="breaking-ticker__type font-mono uppercase tracking-mono text-cream shrink-0">
            {"PRESS WIRE ▸ "}
          </span>
          <div className="overflow-hidden flex-1">
            <div className="animate-marquee whitespace-nowrap">
              <span className="breaking-ticker__type font-mono uppercase tracking-mono text-cream">
                {text} · {text}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-ink py-3 overflow-hidden">
      <div className="mx-auto max-w-[1440px] px-6 flex items-center gap-4">
        <LiveIndicator />
        <div className="overflow-hidden flex-1">
          <div className="animate-marquee whitespace-nowrap">
            <span className="font-mono text-meta uppercase tracking-mono text-cream">
              {text} · {text}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

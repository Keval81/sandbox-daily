"use client";

import { LiveIndicator } from "./live-indicator";

interface BreakingTickerProps {
  headlines: string[];
  /** Front-page treatment: same ink strip and Live dot as the base ticker,
   *  one type size up (13px vs the 11px meta) — the old full-width orange
   *  PRESS WIRE banner is retired. Other consumers (e.g. /news) omit this
   *  and keep the original sizing. */
  front?: boolean;
}

export function BreakingTicker({ headlines, front = false }: BreakingTickerProps) {
  // An empty feed now reaches this component (the lib no longer invents a
  // placeholder headline) — an empty marquee is a stripe of dead ink, so
  // render nothing at all instead.
  if (headlines.length === 0) return null;

  const text = headlines.join(" · ");

  return (
    <div className={`sd-chrome bg-ink overflow-hidden ${front ? "breaking-ticker--front py-3" : "py-3"}`}>
      <div className="mx-auto max-w-[1440px] px-6 flex items-center gap-4">
        <LiveIndicator />
        <div className="overflow-hidden flex-1">
          <div className="animate-marquee whitespace-nowrap">
            <span
              className={`breaking-ticker__type font-mono uppercase tracking-mono text-cream ${
                front ? "" : "text-meta"
              }`}
            >
              {text} · {text}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

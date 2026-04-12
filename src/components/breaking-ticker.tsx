"use client";

import { LiveIndicator } from "./live-indicator";

interface BreakingTickerProps {
  headlines: string[];
}

export function BreakingTicker({ headlines }: BreakingTickerProps) {
  const text = headlines.join(" · ");

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

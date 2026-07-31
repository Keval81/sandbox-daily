"use client";

import { useEffect, useState } from "react";
import { formatStamp } from "@/components/pulse/format";
import { deriveHeroStatus } from "@/lib/pulse/hero";
import type { PulseSnapshot } from "@/lib/pulse/types";

/**
 * Client half of the hero: the stat line, whisper and aside all read off
 * `now`, which has to keep ticking or a tab left open shows "● LIVE" forever
 * (NightHero is server-rendered once, at request time). Mirrors
 * pulse-client.tsx's now/tick pattern exactly — seeded from generatedAt so
 * the server render and the first client render agree, deferred setTimeout
 * before the wall clock takes over so hydration never mismatches.
 */
export function NightHeroStat({ snapshot }: { snapshot: PulseSnapshot }) {
  const [now, setNow] = useState(() => Date.parse(snapshot.generatedAt));

  useEffect(() => {
    const sync = () => setNow(Date.now());
    const first = setTimeout(sync, 0);
    const id = setInterval(sync, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const status = deriveHeroStatus(snapshot, now);

  return (
    <>
      <p className="night-hero-stat">
        {status.mode === "live" ? (
          <>
            <span className="night-hero-pip" data-live>● LIVE</span>{" "}
            <span className="font-mono">{status.totalEvents} live events</span>
            {status.indexChips.map((c) => (
              <span key={c.layerId} className="font-mono night-hero-chip">
                {" · "}{c.label} index <b style={{ color: c.color }}>{c.score}</b>
              </span>
            ))}
            {status.aside && <span className="night-hero-aside"> {status.aside}</span>}
          </>
        ) : (
          <>
            <span className="night-hero-pip">◌ SNAPSHOT</span>{" "}
            <span className="font-mono">last checked {formatStamp(status.generatedAt)}</span>
          </>
        )}
      </p>

      {status.whisper.length > 0 && (
        <p className="night-hero-whisper font-mono">
          {status.whisper.map((w) => `${w.label} ${w.count}`).join(" · ")}
        </p>
      )}
    </>
  );
}

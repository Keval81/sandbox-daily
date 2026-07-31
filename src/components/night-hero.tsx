import Link from "next/link";
import { NightHeroGlobe } from "@/components/night-hero-globe";
import { formatStamp } from "@/components/pulse/format";
import { deriveHeroStatus, markersFromSnapshot } from "@/lib/pulse/hero";
import type { PulseSnapshot } from "@/lib/pulse/types";

export function NightHero({ snapshot }: { snapshot: PulseSnapshot }) {
  // Seeded from generatedAt (freshnessOf's hydration-safe convention).
  const status = deriveHeroStatus(snapshot, Date.parse(snapshot.generatedAt));
  const markers = markersFromSnapshot(snapshot, status.mode === "snapshot");

  return (
    <section className="night-hero">
      <div className="night-hero-grain" aria-hidden />
      <h1 className="night-hero-masthead">
        Sandbox <em>Daily</em>
      </h1>
      <p className="night-hero-strapline">THE PLANET, FACT-CHECKED DAILY</p>

      <NightHeroGlobe markers={markers} />

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

      <p className="night-hero-hint">
        DRAG TO TURN · <Link href="/pulse">TAP TO OPEN</Link> · ↓ TODAY&rsquo;S STORIES
      </p>
    </section>
  );
}

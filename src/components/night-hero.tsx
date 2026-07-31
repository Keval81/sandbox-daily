import Link from "next/link";
import { NightHeroGlobe } from "@/components/night-hero-globe";
import { NightHeroStat } from "@/components/night-hero-stat";
import { deriveHeroStatus, markersFromSnapshot } from "@/lib/pulse/hero";
import type { PulseSnapshot } from "@/lib/pulse/types";

export function NightHero({ snapshot }: { snapshot: PulseSnapshot }) {
  // Markers are derived once, server-side, from the snapshot's own timestamp
  // (freshnessOf's hydration-safe convention) — dimming the globe on age is
  // not required, only the printed claim (NightHeroStat, client) has to age
  // honestly, so the marker colours don't need to keep ticking.
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

      <NightHeroStat snapshot={snapshot} />

      <p className="night-hero-hint">
        DRAG TO TURN · <Link href="/pulse">TAP TO OPEN</Link> · ↓ TODAY&rsquo;S STORIES
      </p>
    </section>
  );
}

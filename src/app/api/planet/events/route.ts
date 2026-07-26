import { NextResponse } from "next/server";
import { getHazardFeed } from "@/lib/planet/sources";
import { SAMPLE_EVENTS } from "@/lib/planet/sample";
import { CATEGORY_ORDER } from "@/lib/planet/categories";
import type { HazardCategory, HazardFeed } from "@/lib/planet/types";

// Re-fetch upstreams at most every 15 minutes; the data layer caches too.
export const revalidate = 900;

function sampleFeed(): HazardFeed {
  const counts = Object.fromEntries(
    CATEGORY_ORDER.map((c) => [c, 0])
  ) as Record<HazardCategory, number>;
  for (const e of SAMPLE_EVENTS) counts[e.category] += 1;
  return {
    events: SAMPLE_EVENTS,
    updatedAt: new Date().toISOString(),
    sources: ["Sample data"],
    degraded: true,
    counts,
  };
}

export async function GET() {
  try {
    const feed = await getHazardFeed();
    return NextResponse.json(feed, {
      headers: {
        "Cache-Control":
          "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch {
    // Never fail the client — degrade to bundled sample data.
    return NextResponse.json(sampleFeed(), {
      headers: { "Cache-Control": "no-store" },
    });
  }
}

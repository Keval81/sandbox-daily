import { NextResponse } from "next/server";
import { getPulseSnapshot } from "@/lib/pulse/snapshot";

export const revalidate = 600;

/**
 * Server-side so the browser never calls NASA directly: no CORS exposure, no
 * per-visitor rate-limit risk, one cached payload for all traffic.
 */
export async function GET() {
  const snapshot = await getPulseSnapshot();
  return NextResponse.json(snapshot);
}

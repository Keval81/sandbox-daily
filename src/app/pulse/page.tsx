import type { Metadata } from "next";
import { getPulseSnapshot } from "@/lib/pulse/snapshot";
import { PulseClient } from "@/components/pulse/pulse-client";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Planet Pulse — Sandbox Daily",
  description:
    "A live globe of the natural hazards currently burning, shaking and flooding across the planet, from NASA EONET and USGS.",
};

export default async function PulsePage() {
  const snapshot = await getPulseSnapshot();
  return <PulseClient snapshot={snapshot} />;
}

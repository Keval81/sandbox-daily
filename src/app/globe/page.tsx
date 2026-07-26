import type { Metadata } from "next";
import { PlanetExplorer } from "@/components/planet/PlanetExplorer";

export const metadata: Metadata = {
  title: "Planet Pulse — Live Wildfires & Natural Hazards | Sandbox Daily",
  description:
    "An interactive 3D globe tracking active wildfires, earthquakes, volcanoes, storms and other natural hazards worldwide, updated live from NASA EONET and USGS.",
};

// The globe fetches live data client-side; keep the page shell static.
export default function GlobePage() {
  return <PlanetExplorer />;
}

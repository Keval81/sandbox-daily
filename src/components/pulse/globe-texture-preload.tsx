import ReactDOM from "react-dom";
import { defaultTextureUrls } from "@/lib/pulse/globe-engine/textures";

/**
 * Starts the globe's texture download with the document instead of after it.
 *
 * The engine only asks for these bytes once the page's JavaScript has booted
 * and PulseGlobe's mount effect has run — on a throttled 4 Mbps phone
 * connection that put the first pin on screen 10.6s after paint (measured
 * against production 2026-08-02), because the canvas is `opacity: 0` until the
 * planet is ready and the pins are drawn into that same canvas. Preloading
 * overlaps those bytes with the JS.
 *
 * Priorities mirror what gates the reveal: the planet (day + topo) is on the
 * critical path, the cloud sheet is not, and marking it `low` keeps it from
 * competing with the two files that are.
 *
 * `ReactDOM.preload`, not a rendered `<link>`: React hoists a rendered link
 * into the head AND emits its own float preload for the same resource, so the
 * head ends up carrying each URL twice. The imperative call emits one.
 *
 * Reads the URLs from `defaultTextureUrls()` rather than repeating them, so
 * the preload and the fetch can never drift apart.
 */
export function GlobeTexturePreload() {
  const { day, topo, clouds } = defaultTextureUrls();
  ReactDOM.preload(day, { as: "image", fetchPriority: "high" });
  ReactDOM.preload(topo, { as: "image", fetchPriority: "high" });
  ReactDOM.preload(clouds, { as: "image", fetchPriority: "low" });
  return null;
}

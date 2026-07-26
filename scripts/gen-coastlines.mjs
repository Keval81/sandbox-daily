import fs from "node:fs";
import { mesh } from "topojson-client";

// Convert bundled world-atlas land into a compact set of coastline line
// segments ([lon,lat] pairs), quantized to 2 decimals to keep the payload
// small enough to import into the client bundle.
const topo = JSON.parse(fs.readFileSync("node_modules/world-atlas/land-110m.json", "utf8"));
const land = mesh(topo, topo.objects.land);

const q = (n) => Math.round(n * 100) / 100;
const lines = land.coordinates.map((line) =>
  line.map(([lon, lat]) => [q(lon), q(lat)])
);

const out = { type: "coastlines", lines };
fs.writeFileSync("src/lib/planet/coastlines.json", JSON.stringify(out));
const segs = lines.reduce((a, l) => a + l.length, 0);
console.log(`Wrote ${lines.length} lines, ${segs} points, ${(fs.statSync("src/lib/planet/coastlines.json").size/1024).toFixed(1)}KB`);

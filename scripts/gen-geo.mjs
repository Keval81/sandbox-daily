import fs from "node:fs";
import { feature, mesh } from "topojson-client";

const q = (n) => Math.round(n * 100) / 100; // 2 decimals

// Land polygons (fill + coastline) — 110m is plenty for the coast at globe scale.
const landTopo = JSON.parse(fs.readFileSync("node_modules/world-atlas/land-110m.json", "utf8"));
const fc = feature(landTopo, landTopo.objects.land);
const polygons = [];
for (const f of fc.features) {
  const g = f.geometry; if (!g) continue;
  const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
  for (const poly of polys) polygons.push(poly.map((r) => r.map(([a, b]) => [q(a), q(b)])));
}
fs.writeFileSync("src/lib/planet/land.json", JSON.stringify({ polygons }));

// Country borders — 50m for crisp, recognizable national boundaries.
const cTopo = JSON.parse(fs.readFileSync("node_modules/world-atlas/countries-50m.json", "utf8"));
const borderMesh = mesh(cTopo, cTopo.objects.countries, (a, b) => a !== b);
const borders = borderMesh.coordinates.map((line) => line.map(([a, b]) => [q(a), q(b)]));
fs.writeFileSync("src/lib/planet/borders.json", JSON.stringify({ lines: borders }));

const sz = (f) => (fs.statSync(f).size / 1024).toFixed(0) + "KB";
console.log("land.json", sz("src/lib/planet/land.json"), polygons.length, "polys");
console.log("borders.json", sz("src/lib/planet/borders.json"), borders.length, "lines");

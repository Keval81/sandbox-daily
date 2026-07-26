import fs from "node:fs";
import { feature, mesh } from "topojson-client";

const q = (n) => Math.round(n * 100) / 100; // 2 decimals — crisp but compact

// Land polygons (fill + coastline) from 110m land.
const landTopo = JSON.parse(fs.readFileSync("node_modules/world-atlas/land-110m.json", "utf8"));
const fc = feature(landTopo, landTopo.objects.land);
const polygons = [];
for (const f of fc.features) {
  const g = f.geometry; if (!g) continue;
  const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
  for (const poly of polys) polygons.push(poly.map((r) => r.map(([a, b]) => [q(a), q(b)])));
}
fs.writeFileSync("src/lib/planet/land.json", JSON.stringify({ polygons }));

// Interior country borders (exclude coastline) from 110m countries.
const cTopo = JSON.parse(fs.readFileSync("node_modules/world-atlas/countries-110m.json", "utf8"));
const borderMesh = mesh(cTopo, cTopo.objects.countries, (a, b) => a !== b);
const borders = borderMesh.coordinates.map((line) => line.map(([a, b]) => [q(a), q(b)]));
fs.writeFileSync("src/lib/planet/borders.json", JSON.stringify({ lines: borders }));

// remove stale coast file if present
try { fs.unlinkSync("src/lib/planet/coast.json"); } catch {}

const sz = (f) => (fs.statSync(f).size / 1024).toFixed(0) + "KB";
const pts = polygons.reduce((a, p) => a + p.reduce((b, r) => b + r.length, 0), 0);
const bpts = borders.reduce((a, l) => a + l.length, 0);
console.log("land.json", sz("src/lib/planet/land.json"), polygons.length, "polys", pts, "pts");
console.log("borders.json", sz("src/lib/planet/borders.json"), borders.length, "lines", bpts, "pts");

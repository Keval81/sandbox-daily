import fs from "node:fs";
import { feature } from "topojson-client";

// Convert bundled world-atlas land into fillable polygons (outer rings + holes)
// for drawing an equirectangular "Blue Marble" earth texture. Quantized to
// 1 decimal — plenty for a ~1024px-wide texture, and keeps the payload small.
const topo = JSON.parse(fs.readFileSync("node_modules/world-atlas/land-110m.json", "utf8"));
const fc = feature(topo, topo.objects.land);

const q = (n) => Math.round(n * 10) / 10;
// land is a GeometryCollection → FeatureCollection; collect every polygon
// (each feature may be a Polygon or MultiPolygon).
const polygons = [];
for (const f of fc.features) {
  const g = f.geometry;
  if (!g) continue;
  const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
  for (const poly of polys) {
    polygons.push(poly.map((ring) => ring.map(([lon, lat]) => [q(lon), q(lat)])));
  }
}

const out = { polygons };
fs.writeFileSync("src/lib/planet/land.json", JSON.stringify(out));
const pts = polygons.reduce((a, p) => a + p.reduce((b, r) => b + r.length, 0), 0);
console.log(`Wrote ${polygons.length} polygons, ${pts} points, ${(fs.statSync("src/lib/planet/land.json").size/1024).toFixed(1)}KB`);

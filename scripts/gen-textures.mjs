// Regenerate the Earth textures served from public/planet/ out of the
// NASA/three.js imagery bundled by the dev-only `three-globe` package.
// Run: node scripts/gen-textures.mjs  (requires devDependencies installed)
import sharp from "sharp";
import fs from "node:fs";

const IMG = "node_modules/three-globe/example/img";
const CLOUDS = "node_modules/three-globe/example/clouds/clouds.png";
const OUT = "public/planet";
fs.mkdirSync(OUT, { recursive: true });

async function run() {
  // Day colour (real Blue Marble) — accurate geography, deserts, forests, ice.
  await sharp(`${IMG}/earth-blue-marble.jpg`)
    .resize(2048, 1024)
    .jpeg({ quality: 84 })
    .toFile(`${OUT}/earth-day.jpg`);

  // Topography → bump map for surface relief (mountains, not a flat plain).
  await sharp(`${IMG}/earth-topology.png`)
    .resize(2048, 1024)
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/earth-topology.png`);

  // Water mask → specular map (only oceans catch the sun).
  await sharp(`${IMG}/earth-water.png`)
    .resize(1024, 512)
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/earth-water.png`);

  // Clouds → compact grayscale JPEG used as an alpha (density) map.
  await sharp(CLOUDS)
    .resize(2048, 1024)
    .extractChannel(3)
    .jpeg({ quality: 82 })
    .toFile(`${OUT}/earth-clouds.jpg`);

  const kb = (f) => (fs.statSync(`${OUT}/${f}`).size / 1024) | 0;
  for (const f of ["earth-day.jpg", "earth-topology.png", "earth-water.png", "earth-clouds.jpg"])
    console.log(f, kb(f) + "KB");
}
run();

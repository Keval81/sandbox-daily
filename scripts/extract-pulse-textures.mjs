// One-shot: pull the three base64 textures out of the rescued prototype into
// real files. Kept in the repo so the extraction is reproducible, not folklore.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const EXT = { jpeg: "jpg", png: "png" };
const src = readFileSync("prototypes/planet-pulse/index.html", "utf8");
const re = /"(day|topo|clouds)":"data:image\/(jpeg|png);base64,([^"]+)"/g;

mkdirSync("public/pulse", { recursive: true });

let found = 0;
for (const [, name, mime, b64] of src.matchAll(re)) {
  const buf = Buffer.from(b64, "base64");
  const out = `public/pulse/${name}.${EXT[mime]}`;
  writeFileSync(out, buf);
  console.log(`${out} — ${(buf.length / 1024).toFixed(0)} KB`);
  found += 1;
}

if (found !== 3) {
  console.error(`Expected 3 textures, extracted ${found}`);
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Copies the pipeline machine's live radar feed into the bundled snapshot the
 * deployed site reads (src/lib/radar/events.snapshot.json).
 *
 * Production has no events.json — the file only exists on this machine — so the
 * committed snapshot IS the ticker in prod, frozen at whatever was copied last.
 * On 2026-08-02 the live site was still running the 2026-08-01 headlines for
 * exactly that reason: `revalidate` re-renders the page but cannot refresh a
 * JSON import baked into the bundle. Only a copy + commit + deploy can.
 *
 * Replaces a bare `cp` so the staleness is stated out loud, not discovered on
 * the live site.
 */
import { copyFile, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUTS = process.env.SSNN_OUTPUTS_ROOT ?? path.join(process.env.HOME ?? "", "Desktop/ssnn-outputs");
const LIVE = path.join(OUTPUTS, "event-radar/events.json");
const SNAPSHOT = path.join(ROOT, "src/lib/radar/events.snapshot.json");

const generatedAt = async (file) => {
  try {
    return JSON.parse(await readFile(file, "utf-8")).generated_at ?? "unknown";
  } catch {
    return null;
  }
};

const hoursSince = (iso) => (Date.now() - Date.parse(iso)) / 3_600_000;

const before = await generatedAt(SNAPSHOT);
const live = await generatedAt(LIVE);

if (live === null) {
  // The deploy host and any machine without the pipeline: nothing to copy, and
  // that is not a failure — the committed snapshot is the intended source there.
  console.log(`[radar:snapshot] no live feed at ${LIVE} — keeping the committed snapshot (${before ?? "unreadable"})`);
  process.exit(0);
}

await copyFile(LIVE, SNAPSHOT);
const { mtime } = await stat(SNAPSHOT);

console.log(`[radar:snapshot] was ${before ?? "unreadable"} -> now ${live}`);
console.log(`[radar:snapshot] copied ${LIVE} at ${mtime.toISOString()}`);
if (hoursSince(live) > 6) {
  console.log(`[radar:snapshot] WARNING: the live feed itself is ${hoursSince(live).toFixed(1)}h old — is the radar running?`);
}
if (before === live) {
  console.log("[radar:snapshot] unchanged — nothing to commit");
} else {
  console.log("[radar:snapshot] CHANGED — commit and deploy, or the live ticker keeps showing the old headlines");
}

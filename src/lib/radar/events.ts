import { readFile } from "node:fs/promises";
import { EVENTS_FILE } from "./paths";

export interface RadarEvent {
  id: string;
  title: string;
  summary: string;
  location: "global" | "london";
  /** Which radar surfaced it. Optional: snapshots written before the tech and
   *  sport radars existed have no vertical, and those are all news. */
  vertical?: "news" | "tech" | "sport";
  authoritative?: boolean;
  tone: number;
  volume: number;
  score: number;
  sources: string[];
  surfaced_at: string;
  latest_seen: string;
  promoted: boolean;
}

export interface EventsFile {
  generated_at: string;
  events: RadarEvent[];
}

/** Reads the radar feed. Returns an empty feed if the file is absent
 *  (e.g. on a deploy where the local agent output doesn't exist). */
export async function readEvents(): Promise<EventsFile> {
  try {
    return JSON.parse(await readFile(EVENTS_FILE, "utf-8")) as EventsFile;
  } catch {
    return { generated_at: "", events: [] };
  }
}

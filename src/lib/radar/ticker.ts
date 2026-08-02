import { readEvents, type EventsFile } from "./events";
import { readBundledSnapshot } from "./feed";

/** Top-N radar headlines for the breaking ticker. `read` (the live machine-
 *  local feed) and `readSnapshot` (the bundled copy) are injectable for tests.
 *  Live feed wins; the snapshot covers deploys, where the live file is always
 *  absent. An empty return means the ticker should not render at all. */
/** Several reputable outlets running the same story — the difference between
 *  "big in sport" and "big". */
const CROSSOVER_VOLUME = 4;

/**
 * Whether an event may appear on the PRESS WIRE.
 *
 * News always may: the wire is its home. Tech and sport have to earn it by
 * corroboration, not by score — since the soft-section penalty stopped applying
 * inside their own radars, they out-score news on identical inputs, so ranking
 * alone would hand the wire to routine sport most days. A story several
 * reputable outlets are all running is one that genuinely broke out.
 */
export function reachesTicker(event: {
  vertical?: "news" | "tech" | "sport";
  volume: number;
  authoritative?: boolean;
}): boolean {
  if ((event.vertical ?? "news") === "news") return true;
  return event.volume >= CROSSOVER_VOLUME && event.authoritative === true;
}

export async function getTickerHeadlines(
  limit = 3,
  read: () => Promise<EventsFile> = readEvents,
  readSnapshot: () => EventsFile = readBundledSnapshot
): Promise<string[]> {
  const live = await read();
  const all = live.events.length > 0 ? live.events : readSnapshot().events;
  const events = all.filter(reachesTicker);
  return events
    .slice(0, limit)
    .map((e) => e.title.trim())
    .filter((t) => t !== "");
}

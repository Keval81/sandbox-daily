import { readEvents, type EventsFile } from "./events";

const FALLBACK = "SANDBOX DAILY — LIVE";

/** Top-N radar headlines for the breaking ticker. `read` is injectable for tests.
 *  Falls back to a single neutral item when the feed is empty or unreadable, so
 *  the marquee never renders empty or shows stale fabricated copy. */
export async function getTickerHeadlines(
  limit = 3,
  read: () => Promise<EventsFile> = readEvents
): Promise<string[]> {
  const { events } = await read();
  const titles = events
    .slice(0, limit)
    .map((e) => e.title.trim())
    .filter((t) => t !== "");
  return titles.length > 0 ? titles : [FALLBACK];
}

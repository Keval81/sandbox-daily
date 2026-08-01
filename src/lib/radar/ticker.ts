import { readEvents, type EventsFile } from "./events";
import snapshot from "./events.snapshot.json";

/** The bundled radar snapshot — the radar's own headlines, frozen at the last
 *  time `npm run radar:snapshot` copied the live feed in before a deploy. The
 *  live events.json only exists on the pipeline machine, so this is what
 *  production reads; it is still RADAR data, not article headlines.
 *  The double cast is confined here: JSON imports type `location` as plain
 *  `string`, not the `"global" | "london"` union. */
const readBundledSnapshot = (): EventsFile => snapshot as unknown as EventsFile;

/** Top-N radar headlines for the breaking ticker. `read` (the live machine-
 *  local feed) and `readSnapshot` (the bundled copy) are injectable for tests.
 *  Live feed wins; the snapshot covers deploys, where the live file is always
 *  absent. An empty return means the ticker should not render at all. */
export async function getTickerHeadlines(
  limit = 3,
  read: () => Promise<EventsFile> = readEvents,
  readSnapshot: () => EventsFile = readBundledSnapshot
): Promise<string[]> {
  const live = await read();
  const events = live.events.length > 0 ? live.events : readSnapshot().events;
  return events
    .slice(0, limit)
    .map((e) => e.title.trim())
    .filter((t) => t !== "");
}

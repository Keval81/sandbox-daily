import { readEvents, type EventsFile } from "./events";
import snapshot from "./events.snapshot.json";

/** The bundled radar snapshot — the radar's own events, frozen at the last
 *  `npm run radar:snapshot` before a deploy. The live events.json only exists
 *  on the pipeline machine, so this is what production reads. The double cast
 *  is confined here: JSON imports type `location` as plain `string`, not the
 *  `"global" | "london"` union. */
export const readBundledSnapshot = (): EventsFile => snapshot as unknown as EventsFile;

/** Live machine-local radar feed when present, else the bundled snapshot.
 *  Shared by the ticker and the globe's news layer so the two can never
 *  disagree about what "the radar" currently says. */
export const readRadarFeed = async (): Promise<EventsFile> => {
  const live = await readEvents();
  return live.events.length > 0 ? live : readBundledSnapshot();
};

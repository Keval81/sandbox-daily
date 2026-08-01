import { readEvents, type EventsFile } from "./events";
import { getAllArticles } from "@/lib/articles";

const latestArticleTitles = (): string[] =>
  getAllArticles()
    .slice(0, 6)
    .map((a) => a.title);

/** Top-N radar headlines for the breaking ticker. `read` is injectable for tests.
 *  The radar feed lives on the pipeline machine's filesystem, so on a deploy it
 *  is always absent — fall back to the latest published article titles (which DO
 *  ship with the build) rather than a static placeholder. An empty return means
 *  the ticker should not render at all. */
export async function getTickerHeadlines(
  limit = 3,
  read: () => Promise<EventsFile> = readEvents,
  fallback: () => string[] = latestArticleTitles
): Promise<string[]> {
  const { events } = await read();
  const titles = events
    .slice(0, limit)
    .map((e) => e.title.trim())
    .filter((t) => t !== "");
  return titles.length > 0 ? titles : fallback();
}

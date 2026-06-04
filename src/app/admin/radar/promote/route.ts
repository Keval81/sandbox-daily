import { writeFile, mkdir, rename, readFile } from "node:fs/promises";
import { join } from "node:path";
import { RESEARCH_LEADS_DIR, RADAR_STATE_FILE } from "@/lib/radar/paths";
import { readEvents } from "@/lib/radar/events";

export async function POST(req: Request): Promise<Response> {
  const { event_id } = (await req.json()) as { event_id?: string };
  if (!event_id) return Response.json({ error: "event_id required" }, { status: 400 });

  const { events } = await readEvents();
  const event = events.find((e) => e.id === event_id);
  if (!event) return Response.json({ error: "unknown event_id" }, { status: 404 });

  // 1) write the lead atomically
  await mkdir(RESEARCH_LEADS_DIR, { recursive: true });
  const lead = {
    event_id: event.id,
    title: event.title,
    summary: event.summary,
    sources: event.sources,
    location: event.location,
    promoted_at: new Date().toISOString(),
  };
  const dest = join(RESEARCH_LEADS_DIR, `${event.id}.json`);
  const tmp = `${dest}.tmp`;
  await writeFile(tmp, JSON.stringify(lead, null, 2));
  await rename(tmp, dest);

  // 2) mark promoted in radar-state (source of truth) atomically
  let state: { seen: Record<string, string>; promoted: string[] };
  try { state = JSON.parse(await readFile(RADAR_STATE_FILE, "utf-8")); }
  catch { state = { seen: {}, promoted: [] }; }
  if (!state.promoted.includes(event.id)) state.promoted.push(event.id);
  const stmp = `${RADAR_STATE_FILE}.tmp`;
  await writeFile(stmp, JSON.stringify(state, null, 2));
  await rename(stmp, RADAR_STATE_FILE);

  return Response.json({ ok: true });
}

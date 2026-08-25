import path from "node:path";

const HOME = process.env.HOME ?? "/Users/sandboxsansan";
const OUTPUTS_ROOT =
  process.env.SSNN_OUTPUTS_ROOT ?? path.join(HOME, "Projects/ssnn-outputs");

export const EVENTS_FILE = path.join(OUTPUTS_ROOT, "event-radar/events.json");
export const RADAR_STATE_FILE = path.join(OUTPUTS_ROOT, "event-radar/radar-state.json");
export const RESEARCH_LEADS_DIR = path.join(OUTPUTS_ROOT, "research-leads");

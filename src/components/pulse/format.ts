/**
 * Display helpers ported from the prototype (prototypes/planet-pulse/index.html
 * lines 223–231). Presentation only, no domain logic — no unit tests, per the
 * spec's stated testing boundary.
 */

export const timeAgo = (iso: string, now: number): string => {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d ago`;
  return `${Math.round(d / 30)}mo ago`;
};

export const severityLabel = (v: number): string =>
  v >= 0.8 ? "Extreme" : v >= 0.6 ? "High" : v >= 0.4 ? "Moderate" : "Low";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * UTC, and formatted by hand rather than through toLocale* — a locale- or
 * timezone-dependent stamp renders one string on the server and another in the
 * browser, which is a hydration mismatch on the one line that must never be
 * wrong about time.
 */
export const formatStamp = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes()
  )} UTC`;
};

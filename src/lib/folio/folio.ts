import { WEATHER_REVALIDATE_SECONDS, type WeatherReading } from "./weather";

export interface FolioLine {
  dateLine: string; // "FRIDAY 31 JULY 2026"
  clock: string; // "14:22" — 24h, London local
  tempC: number | null; // null = omit segment
  edition: number; // days since 2026-01-01 (UTC), 1-based
}

const LONDON_TZ = "Europe/London";

/**
 * Edition day one. Counted on the UTC calendar, deliberately not London's —
 * unlike dateLine/clock below, the edition number does not observe BST, so
 * it can never double-book or skip a day across the spring/autumn clock
 * change.
 */
const EDITION_EPOCH_MS = Date.UTC(2026, 0, 1);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const editionFor = (nowEpochMs: number): number =>
  Math.floor((nowEpochMs - EDITION_EPOCH_MS) / MS_PER_DAY) + 1;

/**
 * Formatters are built fresh on every call rather than cached at module
 * scope. An Intl.DateTimeFormat that omits `timeZone` bakes in whatever the
 * process's ambient TZ was AT CONSTRUCTION TIME and does not re-read it
 * later — so a module-scope instance built once at import time could survive
 * a later ambient-TZ change undetected, letting a TZ-proof test pass by
 * accident. Building fresh per call keeps the explicit
 * `timeZone: "Europe/London"` below the only thing standing between this and
 * a wrong hour — which is exactly what the TZ-proof test in folio.test.ts
 * exercises. Same category of bug as the GDACS `asUtc` fix
 * (src/lib/pulse/normalise-gdacs.ts), applied to display formatting instead
 * of feed parsing.
 */
const dateLineFor = (nowEpochMs: number): string => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: LONDON_TZ,
  });
  const parts = formatter.formatToParts(new Date(nowEpochMs));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  // Built from parts, not the formatter's own joined string, because en-GB's
  // default rendering inserts a comma after the weekday ("Friday, 31 July
  // 2026") — the spec is explicit that the dateLine carries no commas.
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`.toUpperCase();
};

const clockFor = (nowEpochMs: number): string =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: LONDON_TZ,
  }).format(new Date(nowEpochMs));

/**
 * A weather reading is only ever trusted inside its own revalidate window
 * (Critical 1 fix). FolioRow re-derives this on a minute tick with a ticking
 * `now`, but `weather` itself is a frozen prop seeded once at render — an
 * open tab would otherwise keep showing an hours-old LONDON N°C beside a
 * live clock forever, since nothing else ever re-fetches it client-side.
 * Comparing against WEATHER_REVALIDATE_SECONDS (the same constant that gates
 * the server-side cache in weather.ts) means a stale reading ages out of the
 * folio line exactly when it ages out of the cache — one definition of
 * "stale", not two that could drift apart.
 */
const isStaleWeather = (nowEpochMs: number, weather: WeatherReading): boolean =>
  nowEpochMs - Date.parse(weather.fetchedAt) > WEATHER_REVALIDATE_SECONDS * 1000;

export const deriveFolio = (nowEpochMs: number, weather: WeatherReading | null): FolioLine => ({
  dateLine: dateLineFor(nowEpochMs),
  clock: clockFor(nowEpochMs),
  tempC: weather && !isStaleWeather(nowEpochMs, weather) ? weather.tempC : null,
  edition: editionFor(nowEpochMs),
});

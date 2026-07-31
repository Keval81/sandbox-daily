export interface WeatherReading {
  tempC: number;
  fetchedAt: string;
}

/**
 * How long a fetched reading is reused before a fresh fetch is required.
 * Weather ages fast — an hour-old temperature is a lie — so the cache never
 * serves a last-good reading past its own window; see createWeatherReader.
 */
export const WEATHER_REVALIDATE_SECONDS = 1800;

// Keyless Open-Meteo current-conditions endpoint, pinned to London
// (51.5072, -0.1276) — see docs/superpowers/plans/2026-07-31-night-edition-v3.md.
const LONDON_WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=51.5072&longitude=-0.1276&current=temperature_2m";

/** A hung upstream must not hang the caller; same treatment as the pulse
 *  hazards layer (src/lib/pulse/layers/hazards.ts). */
const TIMEOUT_MS = 5000;

interface OpenMeteoResponse {
  current?: { temperature_2m?: unknown };
}

/**
 * Injectable fetch and clock so the reader is testable without touching the
 * network or real wall-clock time — same seam as `createHazardsLayer` in
 * src/lib/pulse/layers/hazards.ts. `now` exists purely so the 30-minute
 * cache window can be driven deterministically in tests; production code
 * never calls it directly, it only ever flows in as `getLondonWeather`'s
 * default `Date.now` binding, at the same edge where `fetch` defaults in.
 */
export const createWeatherReader = (
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): (() => Promise<WeatherReading | null>) => {
  let cached: { reading: WeatherReading; expiresAt: number } | null = null;
  // Two concurrent callers hitting a cold/expired cache (e.g. the hero and
  // the footer both requesting a snapshot in the same render pass) must not
  // each fire their own request at open-meteo — that is a thundering herd
  // against a keyless upstream. This holds the shared in-flight promise so a
  // second caller awaits the first caller's request instead of starting its
  // own; it is cleared as soon as that request settles (success or
  // failure), so a later call — whether cache-hit or genuine retry — always
  // sees fresh state.
  let inFlight: Promise<WeatherReading | null> | null = null;

  const fetchFresh = async (nowMs: number): Promise<WeatherReading | null> => {
    try {
      const res = await fetchImpl(LONDON_WEATHER_URL, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as OpenMeteoResponse;
      const raw = data?.current?.temperature_2m;
      if (typeof raw !== "number" || !Number.isFinite(raw)) return null;

      const reading: WeatherReading = {
        tempC: Math.round(raw),
        fetchedAt: new Date(nowMs).toISOString(),
      };
      cached = { reading, expiresAt: nowMs + WEATHER_REVALIDATE_SECONDS * 1000 };
      return reading;
    } catch {
      // Covers a thrown fetch (network failure, the timeout above) and a
      // response body that fails to parse as JSON. Either way: honesty means
      // null here, never a stale or fabricated reading.
      return null;
    }
  };

  return async (): Promise<WeatherReading | null> => {
    const nowMs = now();
    if (cached && nowMs < cached.expiresAt) return cached.reading;

    if (!inFlight) {
      inFlight = fetchFresh(nowMs).finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
};

/** Production singleton: real network, real clock. Tests call
 *  createWeatherReader directly with stubs for both. */
export const getLondonWeather = createWeatherReader();

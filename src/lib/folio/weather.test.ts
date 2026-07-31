import { test } from "node:test";
import assert from "node:assert/strict";
import { createWeatherReader, WEATHER_REVALIDATE_SECONDS } from "./weather";

const jsonResponse = (body: unknown, ok = true): Response => ({ ok, json: async () => body }) as Response;

const throwingFetch = (async () => {
  throw new Error("upstream down");
}) as typeof fetch;

/** A reconfigurable, call-counting fetch stub — needed for the cache tests,
 *  which must observe the same reader move from "feed up" to "feed dead"
 *  across two calls without constructing a fresh reader (that would also
 *  reset the in-process cache under test). Mirrors the `stubFetch` seam in
 *  src/lib/pulse/layers.test.ts, extended with a call counter. */
const stubFetch = () => {
  let impl: typeof fetch = (async () => jsonResponse({ current: { temperature_2m: 21.4 } })) as typeof fetch;
  let count = 0;
  const fetchImpl = (async (...args: Parameters<typeof fetch>) => {
    count += 1;
    return impl(...args);
  }) as typeof fetch;
  return { fetchImpl, setImpl: (fn: typeof fetch) => { impl = fn; }, calls: () => count };
};

test("WEATHER_REVALIDATE_SECONDS is 30 minutes", () => {
  assert.equal(WEATHER_REVALIDATE_SECONDS, 1800);
});

test("fetches the open-meteo shape and rounds the temperature to an int", async () => {
  const fetchImpl = (async () => jsonResponse({ current: { temperature_2m: 21.4 } })) as typeof fetch;
  const reader = createWeatherReader(fetchImpl, () => 1_000_000);
  const reading = await reader();
  assert.deepEqual(reading, { tempC: 21, fetchedAt: new Date(1_000_000).toISOString() });
});

test("rounds down as well as up", async () => {
  const fetchImpl = (async () => jsonResponse({ current: { temperature_2m: 21.49 } })) as typeof fetch;
  const reader = createWeatherReader(fetchImpl, () => 1_000_000);
  const reading = await reader();
  assert.equal(reading?.tempC, 21);
});

test("a non-ok response is unavailable, not an error thrown up the stack", async () => {
  const fetchImpl = (async () => jsonResponse({}, false)) as typeof fetch;
  const reader = createWeatherReader(fetchImpl, () => 1_000_000);
  assert.equal(await reader(), null);
});

test("a thrown fetch (network failure, timeout) resolves to null", async () => {
  const reader = createWeatherReader(throwingFetch, () => 1_000_000);
  assert.equal(await reader(), null);
});

test("a response body that fails to parse as JSON resolves to null", async () => {
  const fetchImpl = (async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  })) as unknown as typeof fetch;
  const reader = createWeatherReader(fetchImpl, () => 1_000_000);
  assert.equal(await reader(), null);
});

test("a payload missing current.temperature_2m resolves to null rather than fabricating a reading", async () => {
  const fetchImpl = (async () => jsonResponse({ current: {} })) as typeof fetch;
  const reader = createWeatherReader(fetchImpl, () => 1_000_000);
  assert.equal(await reader(), null);
});

test("a non-numeric temperature_2m resolves to null", async () => {
  const fetchImpl = (async () => jsonResponse({ current: { temperature_2m: "warm" } })) as typeof fetch;
  const reader = createWeatherReader(fetchImpl, () => 1_000_000);
  assert.equal(await reader(), null);
});

test("a second call inside the 30-minute window is served from cache, no second fetch", async () => {
  const { fetchImpl, calls } = stubFetch();
  let now = 1_000_000;
  const reader = createWeatherReader(fetchImpl, () => now);

  const first = await reader();
  assert.equal(calls(), 1);
  assert.equal(first?.tempC, 21);

  now += 10 * 60 * 1000; // +10 minutes, still inside the 30-minute window
  const second = await reader();
  assert.equal(calls(), 1, "no second fetch should have happened");
  assert.deepEqual(second, first);
});

test("past the 30-minute window a failing refetch returns null, never the last-good reading", async () => {
  const { fetchImpl, setImpl, calls } = stubFetch();
  let now = 1_000_000;
  const reader = createWeatherReader(fetchImpl, () => now);

  const first = await reader();
  assert.equal(first?.tempC, 21);

  now += WEATHER_REVALIDATE_SECONDS * 1000 + 1; // just past the window
  setImpl(throwingFetch);
  const second = await reader();
  assert.equal(calls(), 2, "a refetch should have been attempted");
  assert.equal(second, null, "an hour-old temp is a lie — no last-good beyond the window");
});

test("past the 30-minute window a successful refetch replaces the cached reading", async () => {
  const { fetchImpl, setImpl, calls } = stubFetch();
  let now = 1_000_000;
  const reader = createWeatherReader(fetchImpl, () => now);

  await reader();
  now += WEATHER_REVALIDATE_SECONDS * 1000 + 1;
  setImpl((async () => jsonResponse({ current: { temperature_2m: 9.6 } })) as typeof fetch);

  const second = await reader();
  assert.equal(calls(), 2);
  assert.equal(second?.tempC, 10);
});

test("getLondonWeather is exported with the production (real fetch, real clock) binding", async () => {
  const { getLondonWeather } = await import("./weather");
  assert.equal(typeof getLondonWeather, "function");
  assert.equal(getLondonWeather.length, 0);
});

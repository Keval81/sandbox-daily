"use client";

import { useEffect, useState } from "react";
import { deriveFolio } from "@/lib/folio/folio";
import type { WeatherReading } from "@/lib/folio/weather";

/**
 * Where a paper prints its date + price — now a centred line directly under
 * the nameplate (Day Edition): `№ N · {dateLine} · {clock} · LONDON {tempC}°C`.
 * The temp segment is omitted entirely — no placeholder — when tempC is null,
 * per the honesty rule extended to weather. The layer-chip slot is gone: the
 * front page no longer carries globe filters (Pulse owns filtering).
 */
export function FolioRow({
  seedEpochMs,
  weather,
}: {
  seedEpochMs: number;
  weather: WeatherReading | null;
}) {
  // Seed/tick pattern shared with HeroFrontPage's data clock: state starts at
  // the server-provided seed so the first client render matches the server
  // HTML exactly, and only reads the wall clock inside the effect — deferred
  // past first paint, then on a minute tick. Re-deriving via deriveFolio on
  // every tick (rather than just reformatting the clock) is what makes
  // dateLine flip correctly at London midnight, not just at UTC midnight.
  const [now, setNow] = useState(seedEpochMs);
  useEffect(() => {
    const sync = () => setNow(Date.now());
    const first = setTimeout(sync, 0);
    const id = setInterval(sync, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const folio = deriveFolio(now, weather);
  const base = `№ ${folio.edition} · ${folio.dateLine} · ${folio.clock}`;
  const folioText =
    folio.tempC === null ? base : `${base} · LONDON ${folio.tempC}°C`;

  return (
    <div className="folio-row">
      <p className="folio-row-line font-mono">{folioText}</p>
    </div>
  );
}

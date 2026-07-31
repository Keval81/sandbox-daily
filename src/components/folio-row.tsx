"use client";

import { useEffect, useState, type ReactNode } from "react";
import { deriveFolio } from "@/lib/folio/folio";
import type { WeatherReading } from "@/lib/folio/weather";

/**
 * Where a paper prints its date + price. Hairline-bottom mono strip:
 * `{dateLine} · {clock} · LONDON {tempC}°C` on the left (temp segment
 * omitted entirely — no placeholder — when tempC is null, per the honesty
 * rule extended to weather), the chips slot on the right.
 *
 * `children` is deliberately generic (not a chips-specific prop): Task 4
 * moves the existing layer filter chip row here from HeroFrontPage and
 * passes it straight through, so this component never needs to know what a
 * "chip" is.
 */
export function FolioRow({
  seedEpochMs,
  weather,
  children,
}: {
  seedEpochMs: number;
  weather: WeatherReading | null;
  children?: ReactNode;
}) {
  // Same seed/tick pattern as HeroFrontPage's shared clock
  // (hero-front-page.tsx): state starts at the server-provided seed so the
  // first client render matches the server HTML exactly, and only reads the
  // wall clock inside the effect — deferred past first paint, then on a
  // minute tick. Re-deriving via deriveFolio on every tick (rather than just
  // reformatting the clock) is what makes dateLine flip correctly at London
  // midnight, not just at UTC midnight.
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
  const folioText =
    folio.tempC === null
      ? `${folio.dateLine} · ${folio.clock}`
      : `${folio.dateLine} · ${folio.clock} · LONDON ${folio.tempC}°C`;

  return (
    <div className="folio-row">
      <p className="folio-row-line font-mono">{folioText}</p>
      <div className="folio-row-chips">{children}</div>
    </div>
  );
}

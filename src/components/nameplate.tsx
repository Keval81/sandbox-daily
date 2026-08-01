import Link from "next/link";
import { FolioRow } from "@/components/folio-row";
import { verticals } from "@/lib/verticals";
import type { WeatherReading } from "@/lib/folio/weather";
import type { Vertical } from "@/lib/types";

const RAIL_ORDER: Vertical[] = ["news", "tech", "sport", "features"];

/** Tick colours are literal print swatches on paper, so tech can't use its
 *  cream `navIndicator` here — cream-on-paper is invisible. Ink stands in. */
const RAIL_TICK: Record<Vertical, string> = {
  news: "var(--color-orange)",
  tech: "var(--color-ink)",
  sport: "var(--color-green)",
  features: "var(--color-orange)",
};

/**
 * The printed masthead, top of the front page (Day Edition): ears flanking
 * the nameplate, then the folio line (client — it ticks), then the section
 * rail, closed by the broadsheet double rule. Server component; FolioRow is
 * the one client island inside it.
 */
export function Nameplate({
  folioSeedEpochMs,
  weather,
}: {
  folioSeedEpochMs: number;
  weather: WeatherReading | null;
}) {
  return (
    <header className="masthead">
      <div className="masthead-plate">
        <p className="masthead-ear masthead-ear--left font-mono">
          PRINTED
          <br />
          NIGHTLY
        </p>
        <h1 className="masthead-title">
          Sandbox <em>Daily</em>
        </h1>
        <p className="masthead-ear masthead-ear--right font-mono">
          THE PLANET,
          <br />
          FACT-CHECKED
        </p>
      </div>

      <FolioRow seedEpochMs={folioSeedEpochMs} weather={weather} />

      <nav className="masthead-rail" aria-label="Sections">
        {RAIL_ORDER.map((v) => (
          <Link key={v} href={verticals[v].route} className="masthead-rail-link font-mono">
            <span className="masthead-rail-tick" style={{ background: RAIL_TICK[v] }} aria-hidden />
            {verticals[v].label}
          </Link>
        ))}
        <Link href="/pulse" className="masthead-rail-link font-mono">
          <span className="masthead-rail-tick" style={{ background: "var(--color-accent)" }} aria-hidden />
          PULSE
        </Link>
      </nav>
    </header>
  );
}

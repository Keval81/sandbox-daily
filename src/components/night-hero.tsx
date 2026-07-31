import { HeroFrontPage, type HeroArticle } from "@/components/hero-front-page";
import { Nameplate } from "@/components/nameplate";
import { BreakingTicker } from "@/components/breaking-ticker";
import { deriveFolio } from "@/lib/folio/folio";
import type { WeatherReading } from "@/lib/folio/weather";
import type { PulseSnapshot } from "@/lib/pulse/types";

export type { HeroArticle };

/**
 * Server shell: the section wrapper, the grain overlay, and the two pieces
 * that CAN'T live inside HeroFrontPage — Nameplate and the PRESS WIRE ticker
 * are server-rendered here and handed down as ReactNode props, because a
 * client component can't render a server component inline (the standard
 * Next "pass server output as children/props through the client boundary"
 * pattern). Everything else — folio row, lead/headlines, globe, hover/tap
 * cards, chips, live line — is HeroFrontPage's, because it owns the ticking
 * clock all of them share.
 *
 * `seedEpochMs` is derived once, here, from `snapshot.generatedAt` (not
 * `Date.now()`) — the same honest clock the hero's status/cards/markers
 * already use, extended one hop further upstream so the folio row's date/
 * clock and the nameplate's edition number agree with them by construction.
 */
export function NightHero({
  snapshot,
  articles,
  weather,
  wireHeadlines,
}: {
  snapshot: PulseSnapshot;
  articles: HeroArticle[];
  weather: WeatherReading | null;
  wireHeadlines: string[];
}) {
  const seedEpochMs = Date.parse(snapshot.generatedAt);
  const { edition } = deriveFolio(seedEpochMs, weather);

  return (
    <section className="night-hero">
      <div className="night-hero-grain" aria-hidden />
      <HeroFrontPage
        snapshot={snapshot}
        articles={articles}
        weather={weather}
        seedEpochMs={seedEpochMs}
        // Explicit `key`s here, even though each renders exactly once: without
        // one, BreakingTicker (a Client Component built in this Server
        // Component, then threaded through as a prop and interpolated as one
        // of several siblings inside HeroFrontPage's top-level fragment)
        // triggers React's "missing key" warning in dev — the `jsxs` static-
        // children marking that normally exempts a plain multi-child fragment
        // doesn't survive a Client Component reference crossing the RSC
        // boundary this way. Nameplate (a Server Component) doesn't hit it,
        // but keying both here is cheap and keeps the pair symmetric.
        nameplate={<Nameplate key="nameplate" edition={edition} />}
        wire={<BreakingTicker key="wire" headlines={wireHeadlines} wire />}
      />
    </section>
  );
}

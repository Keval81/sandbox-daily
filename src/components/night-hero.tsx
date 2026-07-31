import { HeroFrontPage, type HeroArticle } from "@/components/hero-front-page";
import { Nameplate } from "@/components/nameplate";
import { deriveFolio } from "@/lib/folio/folio";
import type { WeatherReading } from "@/lib/folio/weather";
import type { PulseSnapshot } from "@/lib/pulse/types";

export type { HeroArticle };

/**
 * Server shell: the section wrapper, the grain overlay, the perforated fold
 * at the front page's own trailing edge, and the one piece that CAN'T live
 * inside HeroFrontPage — Nameplate is server-rendered here and handed down
 * as a ReactNode prop, because a client component can't render a server
 * component inline (the standard Next "pass server output as children/props
 * through the client boundary" pattern). BreakingTicker doesn't need this —
 * it's a Client Component itself, so HeroFrontPage imports and renders it
 * directly off the plain `wireHeadlines` array. Everything else — folio
 * row, lead/headlines, globe, hover/tap cards, chips, live line — is
 * HeroFrontPage's, because it owns the ticking clock all of them share.
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
        nameplate={<Nameplate edition={edition} />}
        wireHeadlines={wireHeadlines}
      />
      {/* The broadsheet fold: a perforated seam, printed as part of the
         front page's own trailing edge — nested inside .night-hero so its
         ink background paints behind the dashes (a sibling div here would
         sit on the document body's own cream background instead, where
         cream-on-cream dashes are invisible; caught in review). Decorative
         only, nothing here needs a live region or a role. */}
      <div className="fold-perforation" aria-hidden />
    </section>
  );
}

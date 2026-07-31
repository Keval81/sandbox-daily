import { HeroFrontPage, type HeroArticle } from "@/components/hero-front-page";
import type { PulseSnapshot } from "@/lib/pulse/types";

export type { HeroArticle };

/**
 * Server shell only: the section wrapper and the grain overlay (static, no
 * reason to ship it to the client). Everything else — masthead, headlines,
 * globe, hover/tap cards, chips, live line — is HeroFrontPage's, because it
 * owns the ticking clock that all of them have to share. deriveHeroStatus,
 * eventCardsById and the marker-dimming call must never read off separate
 * clocks — that's the exact seam Task 2's fix round closed for cards, and
 * splitting derivation between a server render and a client tick here would
 * reopen it for markers instead.
 */
export function NightHero({ snapshot, articles }: { snapshot: PulseSnapshot; articles: HeroArticle[] }) {
  return (
    <section className="night-hero">
      <div className="night-hero-grain" aria-hidden />
      <HeroFrontPage snapshot={snapshot} articles={articles} />
    </section>
  );
}

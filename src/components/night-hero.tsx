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
 * Two seeds, two jobs (Important 1 fix): the folio row's wall clock and the
 * nameplate's edition number must always read the ACTUAL current moment —
 * under pipeline starvation (a documented recurring state) `snapshot` can be
 * hours or days stale, and a FRESH page load printing a days-old edition №
 * beside a pre-hydration clock frozen at that stale timestamp is a lie the
 * hero's own SNAPSHOT pip is simultaneously contradicting a few pixels away.
 * `wallEpochMs` — real `Date.now()` — seeds only those two. `dataEpochMs`,
 * still `Date.parse(snapshot.generatedAt)`, keeps seeding HeroFrontPage's
 * data clock (status/cards/"last checked" stamp) — the one clock on the page
 * that HAS to stay honestly tied to when the snapshot was actually
 * generated, so it can keep saying SNAPSHOT truthfully. Calling `Date.now()`
 * in this server component is safe: the route is re-rendered by ISR
 * (`revalidate = 600` in page.tsx) on a 10-minute cadence, not per-request —
 * unlike a dynamic API (cookies()/headers()/searchParams), it does not opt
 * `/` into dynamic rendering (confirmed in the build's route table: `/`
 * stays ○/ISR, not ƒ). Hydration stays safe too: the client's first render
 * reads `wallEpochMs` off the already-serialized prop, not a fresh
 * client-side `Date.now()` call, so it matches the server HTML exactly;
 * FolioRow's own effect only starts ticking a true wall clock after mount.
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
  // react-hooks/purity flags Date.now() as an impure call "during render"
  // because its analysis has no notion of Server vs. Client Components — it
  // treats every capitalized function as a Client Component that could
  // re-render arbitrarily, where a fresh Date.now() per render really would
  // be a bug. NightHero has no "use client" directive: it runs once per
  // request/ISR-revalidation (see the comment above), not on a client
  // re-render clock, so the concern the rule exists to catch does not apply
  // here.
  // eslint-disable-next-line react-hooks/purity
  const wallEpochMs = Date.now();
  const dataEpochMs = Date.parse(snapshot.generatedAt);
  const { edition } = deriveFolio(wallEpochMs, weather);

  return (
    <section className="night-hero">
      <div className="night-hero-grain" aria-hidden />
      <HeroFrontPage
        snapshot={snapshot}
        articles={articles}
        weather={weather}
        seedEpochMs={dataEpochMs}
        folioSeedEpochMs={wallEpochMs}
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

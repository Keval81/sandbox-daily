import { getAllArticles, getArticlesByVertical } from "@/lib/articles";
import { getTickerHeadlines } from "@/lib/radar/ticker";
import { verticals } from "@/lib/verticals";
import type { Vertical } from "@/lib/types";
import { VerticalStrip } from "@/components/vertical-strip";
import { TrendingBar } from "@/components/trending-bar";
import { ArticleGrid } from "@/components/article-grid";
import { SubscribeStrip } from "@/components/subscribe-strip";
import { getPulseSnapshot } from "@/lib/pulse/snapshot";
import { getLondonWeather } from "@/lib/folio/weather";
import { NightHero, type HeroArticle } from "@/components/night-hero";

/** Must match REVALIDATE_SECONDS in @/lib/pulse/freshness — Next statically
 *  analyses this segment export, so it has to be a literal, not an import. */
export const revalidate = 600;

const trendingTopics = [
  { label: "Fury vs Joshua", score: 94 },
  { label: "Iran Strait", score: 87 },
  { label: "AI Governance", score: 82 },
  { label: "EU Regulation", score: 76 },
  { label: "Usyk Defence", score: 71 },
];

export default async function Home() {
  const articles = getAllArticles().slice(0, 9);
  // Same fields ArticleGrid's own cards build their hrefs from (article-card.tsx:
  // `/${article.category}/${article.slug}`) — kept in sync by construction, not
  // by convention, since both read off the same Article shape. Only the lead
  // (index 0) carries its standfirst through — HeroFrontPage renders it as
  // THE LEAD's two-column dek; the other three are the thumbnail briefs.
  const heroArticles: HeroArticle[] = articles.slice(0, 4).map((a, i) => ({
    href: `/${a.category}/${a.slug}`,
    section: a.category,
    title: a.title,
    standfirst: i === 0 ? a.standfirst : undefined,
    thumb: a.heroImage,
  }));
  // The broadsheet contents box (IN THIS EDITION, plate column): one row per
  // section with its real published-story count.
  const sectionIndex = (["news", "tech", "sport", "features"] as Vertical[]).map((v) => ({
    label: verticals[v].label,
    route: verticals[v].route,
    count: getArticlesByVertical(v).length,
  }));
  // Independent of each other, so fetched in parallel rather than one after
  // the other. getPulseSnapshot's own fetches are cached for 600s, shared
  // with /pulse — this is not a second upstream request. getLondonWeather is
  // its own 30-minute in-process cache (src/lib/folio/weather.ts); a keyless
  // third-party fetch that must never block or fail the page — null (segment
  // omitted downstream) is a legitimate result, not an error to handle here.
  const [breakingHeadlines, pulse, weather] = await Promise.all([
    getTickerHeadlines(),
    getPulseSnapshot(),
    getLondonWeather(),
  ]);

  return (
    <>
      <NightHero
        snapshot={pulse}
        articles={heroArticles}
        weather={weather}
        wireHeadlines={breakingHeadlines}
        sectionIndex={sectionIndex}
      />
      {/* The perforated fold itself is inside NightHero now — nested in
         .night-hero so the ink background paints behind its dashes. */}

      <VerticalStrip />
      <TrendingBar topics={trendingTopics} />
      <ArticleGrid
        articles={articles}
        title="INSIDE THE EDITION ▾"
        titleColor="text-orange"
        typewriterTitles
      />
      <SubscribeStrip />
    </>
  );
}

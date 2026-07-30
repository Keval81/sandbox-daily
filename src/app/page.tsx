import { getAllArticles } from "@/lib/articles";
import { BreakingTicker } from "@/components/breaking-ticker";
import { getTickerHeadlines } from "@/lib/radar/ticker";
import { VerticalStrip } from "@/components/vertical-strip";
import { TrendingBar } from "@/components/trending-bar";
import { ArticleGrid } from "@/components/article-grid";
import { SubscribeStrip } from "@/components/subscribe-strip";
import { getPulseSnapshot } from "@/lib/pulse/snapshot";
import { PulseTeaser } from "@/components/pulse/pulse-teaser";

const trendingTopics = [
  { label: "Fury vs Joshua", score: 94 },
  { label: "Iran Strait", score: 87 },
  { label: "AI Governance", score: 82 },
  { label: "EU Regulation", score: 76 },
  { label: "Usyk Defence", score: 71 },
];

export default async function Home() {
  const articles = getAllArticles().slice(0, 9);
  // Independent of each other, so fetched in parallel rather than one after
  // the other. getPulseSnapshot's own fetches are cached for 600s, shared
  // with /pulse — this is not a second upstream request.
  const [breakingHeadlines, pulse] = await Promise.all([
    getTickerHeadlines(),
    getPulseSnapshot(),
  ]);

  return (
    <>
      <section className="sd-hero">
        <h1 className="sr-only">Sandbox Daily — News, Tech, Sport</h1>
        <video
          className="sd-hero-bg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/images/london-hero-poster.webp"
          disablePictureInPicture
        >
          <source src="/video/london-hero.mp4" type="video/mp4" />
        </video>
        <div className="sd-hero-scrim" />
        <p className="sd-hero-eyebrow">News · Tech · Sport</p>
      </section>

      <BreakingTicker headlines={breakingHeadlines} />
      <VerticalStrip />
      <TrendingBar topics={trendingTopics} />
      <PulseTeaser snapshot={pulse} />
      <ArticleGrid articles={articles} typewriterTitles />
      <SubscribeStrip />
    </>
  );
}

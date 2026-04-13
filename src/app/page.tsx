import { getAllArticles } from "@/lib/articles";
import { BreakingTicker } from "@/components/breaking-ticker";
import { VerticalStrip } from "@/components/vertical-strip";
import { TrendingBar } from "@/components/trending-bar";
import { ArticleGrid } from "@/components/article-grid";
import { SubscribeStrip } from "@/components/subscribe-strip";

const breakingHeadlines = [
  "FURY CHALLENGES JOSHUA AT TOTTENHAM — JOSHUA CALLS HIM A CLOUT CHASER",
  "IRAN WALKS AWAY FROM ISLAMABAD TALKS WITH CEASEFIRE INTACT",
  "ANTHROPIC WITHHOLDS VULNERABILITY-FINDING AI MODEL FROM PUBLIC RELEASE",
];

const trendingTopics = [
  { label: "Fury vs Joshua", score: 94 },
  { label: "Iran Strait", score: 87 },
  { label: "AI Governance", score: 82 },
  { label: "EU Regulation", score: 76 },
  { label: "Usyk Defence", score: 71 },
];

export default function Home() {
  const articles = getAllArticles().slice(0, 9);

  return (
    <>
      {/* Hero — brain video constrained to fixed max size; brand orange fills any surrounding space. */}
      <section className="relative flex items-center justify-center px-6 overflow-hidden bg-orange h-[85vh] min-h-[560px] max-h-[820px]">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/images/brain-orange.png"
          className="relative z-0 w-auto h-auto max-w-[92vw] max-h-[70vh] md:max-h-[640px] object-contain"
          style={{
            maskImage:
              "radial-gradient(ellipse 92% 92% at 50% 50%, black 70%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 92% 92% at 50% 50%, black 70%, transparent 100%)",
          }}
        >
          <source src="/video/hero-orange.mp4" type="video/mp4" />
        </video>

        {/* Centre dim for title legibility over the brain */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 55% 35% at 50% 55%, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 45%, rgba(0,0,0,0) 75%)",
          }}
        />

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-6 pointer-events-none">
          <h1 className="animate-hero-title font-display text-6xl font-black uppercase tracking-tight text-cream md:text-8xl lg:text-9xl leading-display [text-shadow:0_2px_20px_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.5)]">
            Sandbox Daily
          </h1>
          <p className="animate-hero-eyebrow font-mono uppercase tracking-mono-wide text-cream mt-6 text-sm md:text-base [text-shadow:0_1px_8px_rgba(0,0,0,0.55)]">
            News · Tech · Sport
          </p>
        </div>
      </section>

      <BreakingTicker headlines={breakingHeadlines} />
      <VerticalStrip />
      <TrendingBar topics={trendingTopics} />
      <ArticleGrid articles={articles} />
      <SubscribeStrip />
    </>
  );
}

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
      {/* Hero — video background with brain illustration and wordmark overlaid */}
      <section className="relative bg-orange min-h-[80vh] flex items-center justify-center px-6 overflow-hidden">
        {/* Looping video background */}
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-multiply"
          poster="/images/brain-orange.png"
        >
          <source src="/video/hero-orange.mp4" type="video/mp4" />
        </video>
        {/* Brain illustration — prominent, matching logo lockup */}
        <img
          src="/images/brain-orange.png"
          alt=""
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[45%] h-[60vh] max-h-[500px] w-auto object-contain opacity-85 mix-blend-multiply"
        />
        {/* Wordmark */}
        <div className="relative text-center z-10">
          <h1 className="font-display text-7xl font-black uppercase tracking-tight text-cream md:text-9xl leading-display [text-shadow:0_2px_12px_rgba(0,0,0,0.15)]">
            Sandbox Daily
          </h1>
          <p className="font-mono text-meta uppercase tracking-mono-wide text-cream/80 mt-4">
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

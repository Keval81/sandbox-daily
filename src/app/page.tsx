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
      <section className="sd-hero" data-bg="paper">
        <h1 className="sr-only">Sandbox Daily — News, Tech, Sport</h1>
        <video
          className="sd-hero-bg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/images/brain-poster.webp"
          disablePictureInPicture
        >
          <source src="/video/brain-hero.mp4" type="video/mp4" />
        </video>
        <div className="sd-hero-paper-overlay" />
        <div className="sd-hero-text">
          <div className="sd-scribble-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="sd-hero-wordmark"
              src="/images/wordmark-typewriter.webp"
              alt=""
            />
            <svg
              className="sd-scribble"
              viewBox="0 0 1200 520"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <filter id="scribbleFx" x="-3%" y="-5%" width="106%" height="110%">
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.85"
                    numOctaves={2}
                    seed={9}
                    result="n"
                  />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="n"
                    scale={3}
                    xChannelSelector="R"
                    yChannelSelector="G"
                  />
                </filter>
              </defs>
              <g filter="url(#scribbleFx)">
                <path
                  className="sd-scribble-p sd-scribble-p1"
                  d="M 90 200 Q 220 140, 360 195 T 640 200 T 920 200 T 1110 200"
                />
                <path
                  className="sd-scribble-p sd-scribble-p2"
                  d="M 110 250 Q 260 195, 420 245 T 740 250 T 1090 245"
                />
                <path
                  className="sd-scribble-p sd-scribble-p3"
                  d="M 220 350 Q 360 300, 520 350 T 820 350 T 990 350"
                />
                <path
                  className="sd-scribble-p sd-scribble-p4"
                  d="M 240 395 Q 400 355, 580 395 T 870 395 T 970 395"
                />
              </g>
            </svg>
          </div>
          <p className="sd-hero-eyebrow">News · Tech · Sport</p>
        </div>
      </section>

      <BreakingTicker headlines={breakingHeadlines} />
      <VerticalStrip />
      <TrendingBar topics={trendingTopics} />
      <ArticleGrid articles={articles} typewriterTitles />
      <SubscribeStrip />
    </>
  );
}

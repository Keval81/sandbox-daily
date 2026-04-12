import { getArticlesByVertical } from "@/lib/articles";
import { Hero } from "@/components/hero";
import { BreakingTicker } from "@/components/breaking-ticker";
import { ArticleGrid } from "@/components/article-grid";
import { SubscribeStrip } from "@/components/subscribe-strip";

export const metadata = {
  title: "News — Sandbox Daily",
  description: "Breaking news, long-form reporting, opinion and analysis.",
};

export default function NewsPage() {
  const articles = getArticlesByVertical("news");

  return (
    <>
      <Hero
        vertical="news"
        headline="The Intelligence Briefing"
        standfirst="Breaking news, long-form reporting, opinion and analysis. The stories that matter, examined without compromise."
      />
      <BreakingTicker
        headlines={[
          "IRAN WALKS AWAY FROM ISLAMABAD TALKS",
          "EU AI REGULATION FRAMEWORK ADVANCES",
          "STRAIT OF HORMUZ TRANSIT FEES PROPOSED",
        ]}
      />
      <ArticleGrid articles={articles} titleColor="text-orange" />
      <SubscribeStrip vertical="news" headline="Never Miss a Story" />
    </>
  );
}

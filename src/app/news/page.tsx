import { getArticlesByVertical } from "@/lib/articles";
import { Hero } from "@/components/hero";
import { BreakingTicker } from "@/components/breaking-ticker";
import { getTickerHeadlines } from "@/lib/radar/ticker";
import { ArticleGrid } from "@/components/article-grid";
import { SubscribeStrip } from "@/components/subscribe-strip";

/** Must match REVALIDATE_SECONDS in @/lib/pulse/freshness — Next statically
 *  analyses this segment export, so it has to be a literal, not an import.
 *  The global footer now renders pulse data here too. */
export const revalidate = 600;

export const metadata = {
  title: "News — Sandbox Daily",
  description: "Breaking news, long-form reporting, opinion and analysis.",
};

export default async function NewsPage() {
  const articles = getArticlesByVertical("news");
  const breakingHeadlines = await getTickerHeadlines();

  return (
    <>
      <Hero
        vertical="news"
        headline="The Intelligence Briefing"
        standfirst="Breaking news, long-form reporting, opinion and analysis. The stories that matter, examined without compromise."
      />
      <BreakingTicker headlines={breakingHeadlines} />
      <ArticleGrid articles={articles} titleColor="text-orange" />
      <SubscribeStrip vertical="news" headline="Never Miss a Story" />
    </>
  );
}

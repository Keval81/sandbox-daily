import { getArticlesByVertical } from "@/lib/articles";
import { Hero } from "@/components/hero";
import { ArticleGrid } from "@/components/article-grid";
import { SubscribeStrip } from "@/components/subscribe-strip";

/** Must match REVALIDATE_SECONDS in @/lib/pulse/freshness — Next statically
 *  analyses this segment export, so it has to be a literal, not an import.
 *  The global footer now renders pulse data here too. */
export const revalidate = 600;

export const metadata = {
  title: "Sport — Sandbox Daily",
  description: "Elite sport, data-driven tactics, performance science.",
};

export default function SportPage() {
  const articles = getArticlesByVertical("sport");

  return (
    <>
      <Hero
        vertical="sport"
        headline="The Performance Lab"
        standfirst="Elite sport, data-driven tactics, performance science. Where analysis meets athleticism."
      />
      <ArticleGrid articles={articles} titleColor="text-green" />
      <SubscribeStrip vertical="sport" headline="The Edge Is in the Data" />
    </>
  );
}

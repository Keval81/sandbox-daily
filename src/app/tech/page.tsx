import { getArticlesByVertical } from "@/lib/articles";
import { Hero } from "@/components/hero";
import { ArticleGrid } from "@/components/article-grid";
import { SubscribeStrip } from "@/components/subscribe-strip";

/** Must match REVALIDATE_SECONDS in @/lib/pulse/freshness — Next statically
 *  analyses this segment export, so it has to be a literal, not an import.
 *  The global footer now renders pulse data here too. */
export const revalidate = 600;

export const metadata = {
  title: "Tech — Sandbox Daily",
  description: "AI, infrastructure, venture capital, digital culture.",
};

export default function TechPage() {
  const articles = getArticlesByVertical("tech");

  return (
    <>
      <Hero
        vertical="tech"
        headline="The Circuit"
        standfirst="AI, infrastructure, venture capital, digital culture. The technology that reshapes everything."
      />
      <ArticleGrid articles={articles} titleColor="text-ink" />
      <SubscribeStrip
        vertical="tech"
        headline="The Future, Examined"
        subtext="AI, infrastructure and digital culture — examined with rigour."
      />
    </>
  );
}

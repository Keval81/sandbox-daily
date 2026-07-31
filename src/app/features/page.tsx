import { getArticlesByVertical } from "@/lib/articles";
import { Hero } from "@/components/hero";
import { ArticleGrid } from "@/components/article-grid";
import { SubscribeStrip } from "@/components/subscribe-strip";

/** Must match REVALIDATE_SECONDS in @/lib/pulse/freshness — Next statically
 *  analyses this segment export, so it has to be a literal, not an import.
 *  The global footer now renders pulse data here too. */
export const revalidate = 600;

export const metadata = {
  title: "Features — Sandbox Daily",
  description: "Deep dives into science, culture, and the ideas that shape us.",
};

export default function FeaturesPage() {
  const articles = getArticlesByVertical("features");
  const spotlights = articles.filter((a) => !!a.subjectName);
  const longReads = articles.filter((a) => !a.subjectName);

  return (
    <>
      <Hero
        vertical="features"
        headline="The Long Read"
        standfirst="Deep dives into science, culture, and the ideas that shape us. No news hooks required."
      />
      {longReads.length > 0 && (
        <ArticleGrid articles={longReads} title="The Long Read" titleColor="text-ink" />
      )}
      {spotlights.length > 0 && (
        <ArticleGrid articles={spotlights} title="Brilliant Minds" titleColor="text-ink" />
      )}
      <SubscribeStrip
        vertical="features"
        headline="Ideas Worth Sitting With"
        subtext="Long-form explorations of science, evolution, psychology, and culture."
      />
    </>
  );
}

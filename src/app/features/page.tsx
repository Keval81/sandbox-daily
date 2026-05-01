import { getArticlesByVertical } from "@/lib/articles";
import { Hero } from "@/components/hero";
import { ArticleGrid } from "@/components/article-grid";
import { SubscribeStrip } from "@/components/subscribe-strip";

export const metadata = {
  title: "Features — Sandbox Daily",
  description: "Deep dives into science, culture, and the ideas that shape us.",
};

export default function FeaturesPage() {
  const articles = getArticlesByVertical("features");

  return (
    <>
      <Hero
        vertical="features"
        headline="The Long Read"
        standfirst="Deep dives into science, culture, and the ideas that shape us. No news hooks required."
      />
      <ArticleGrid articles={articles} titleColor="text-ink" />
      <SubscribeStrip
        vertical="features"
        headline="Ideas Worth Sitting With"
        subtext="Long-form explorations of science, evolution, psychology, and culture."
      />
    </>
  );
}

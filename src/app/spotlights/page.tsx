import { getArticlesByVertical } from "@/lib/articles";
import { Hero } from "@/components/hero";
import { ArticleGrid } from "@/components/article-grid";
import { SubscribeStrip } from "@/components/subscribe-strip";

export const metadata = {
  title: "Brilliant Minds — Sandbox Daily",
  description:
    "Biographical celebrations of the remarkable individuals shaping science, technology, and culture.",
};

export default function SpotlightsPage() {
  const articles = getArticlesByVertical("spotlights");

  return (
    <>
      <Hero
        vertical="spotlights"
        headline="Brilliant Minds"
        standfirst="Biographical journeys through the lives, breakthroughs, and stubborn instincts of the people quietly bending the world."
      />
      <ArticleGrid articles={articles} titleColor="text-ink" />
      <SubscribeStrip
        vertical="spotlights"
        headline="Lives Worth Knowing"
        subtext="Long-form profiles of the physicists, engineers, artists, and originals who refused the obvious path."
      />
    </>
  );
}

import { getArticlesByVertical } from "@/lib/articles";
import { Hero } from "@/components/hero";
import { ArticleGrid } from "@/components/article-grid";
import { SubscribeStrip } from "@/components/subscribe-strip";

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

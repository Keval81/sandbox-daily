import { type Article } from "@/lib/types";
import { ArticleCard } from "./article-card";

interface ArticleGridProps {
  articles: Article[];
  title?: string;
  titleColor?: string;
}

export function ArticleGrid({
  articles,
  title = "Latest",
  titleColor = "text-ink",
}: ArticleGridProps) {
  return (
    <section className="bg-cream py-16 px-6">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex items-center gap-4 mb-8">
          <h2 className={`font-mono text-meta uppercase tracking-mono-wide ${titleColor}`}>
            {title}
          </h2>
          <div className="flex-1 h-px bg-ink/20" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </div>
    </section>
  );
}

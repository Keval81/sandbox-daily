import Link from "next/link";
import { type Article } from "@/lib/types";
import { verticals } from "@/lib/verticals";

interface ArticleCardProps {
  article: Article;
  showVerticalTag?: boolean;
  dark?: boolean;
}

export function ArticleCard({ article, showVerticalTag = true, dark = false }: ArticleCardProps) {
  const vertical = verticals[article.category];
  const href = `/${article.category}/${article.slug}`;

  const borderColorMap = {
    news: "hover:border-l-orange",
    sport: "hover:border-l-green",
    tech: "hover:border-l-ink",
  } as const;

  const tagColorMap = {
    news: "text-orange",
    sport: "text-green",
    tech: "text-ink",
  } as const;

  return (
    <Link
      href={href}
      className={`group block rounded-sharp border-l-4 border-l-transparent ${borderColorMap[article.category]} transition-all duration-200 cursor-pointer`}
    >
      <article className="p-4">
        {showVerticalTag && (
          <span className={`font-mono text-meta-sm uppercase tracking-mono-wide ${tagColorMap[article.category]}`}>
            {vertical.label}
          </span>
        )}
        <h3 className={`font-display text-xl font-bold leading-headline mt-1 group-hover:opacity-80 transition-opacity ${dark ? "text-cream" : "text-ink"}`}>
          {article.title}
        </h3>
        <p className="font-mono text-meta uppercase tracking-mono text-grey mt-2">
          {new Date(article.date).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}{" "}
          · {article.readTime} min read
        </p>
      </article>
    </Link>
  );
}

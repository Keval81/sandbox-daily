import Link from "next/link";
import Image from "next/image";
import { type Article } from "@/lib/types";
import { verticals } from "@/lib/verticals";
import { TypewriterText } from "./typewriter-text";

interface ArticleCardProps {
  article: Article;
  showVerticalTag?: boolean;
  dark?: boolean;
  /** When set, the title types in with this delay (ms). Used by the homepage grid for staggered entrance. */
  typewriterDelayMs?: number;
}

export function ArticleCard({ article, showVerticalTag = true, dark = false, typewriterDelayMs }: ArticleCardProps) {
  const vertical = verticals[article.category];
  const href = `/${article.category}/${article.slug}`;

  const borderColorMap: Record<string, string> = {
    news: "hover:border-l-orange",
    sport: "hover:border-l-green",
    tech: "hover:border-l-ink",
    features: "hover:border-l-orange",
  };

  const tagColorMap: Record<string, string> = {
    news: "text-orange",
    sport: "text-green",
    tech: "text-ink",
    features: "text-orange",
  };

  const isSpotlight = !!article.subjectName;

  return (
    <Link
      href={href}
      className={`group block rounded-sharp border-l-4 border-l-transparent ${borderColorMap[article.category]} transition-all duration-200 cursor-pointer overflow-hidden`}
    >
      {article.heroImage && (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink/10">
          <Image
            src={article.heroImage}
            alt={article.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      )}
      <article className="p-4">
        {showVerticalTag && (
          <span className={`font-mono text-meta-sm uppercase tracking-mono-wide ${tagColorMap[article.category]}`}>
            {vertical.label}
          </span>
        )}
        <h3 className={`font-display text-xl font-bold leading-headline mt-1 group-hover:opacity-80 transition-opacity ${dark ? "text-cream" : "text-ink"}`}>
          {isSpotlight && (
            <span className="block font-display text-base font-semibold opacity-70 mb-1">
              Spotlight: {article.subjectName}
            </span>
          )}
          {typeof typewriterDelayMs === "number" ? (
            <TypewriterText text={article.title} delayMs={typewriterDelayMs} charMs={28} />
          ) : (
            article.title
          )}
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

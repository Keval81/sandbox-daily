import { notFound } from "next/navigation";
import { getArticleBySlug, getArticlesByVertical, renderMarkdown } from "@/lib/articles";
import { verticals } from "@/lib/verticals";
import { ArticleCard } from "@/components/article-card";
import { ArticleHeroImage } from "@/components/article-hero-image";
import { ARTICLE_PROSE_CLASS, injectInlineImages } from "@/lib/article-html";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getArticlesByVertical("features").map((a) => ({ slug: a.slug }));
}

export default async function FeaturesArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticleBySlug("features", slug);
  if (!article) notFound();

  const renderedHtml = await renderMarkdown(article.content);
  const htmlContent = injectInlineImages(renderedHtml, article.inlineImages);
  const config = verticals.features;
  const related = getArticlesByVertical("features")
    .filter((a) => a.slug !== slug)
    .slice(0, 3);

  return (
    <>
      <section className={`${config.bg} ${config.text} py-20 px-6`}>
        <div className="mx-auto max-w-[1440px]">
          <span className="font-mono text-meta-sm uppercase tracking-mono-wide opacity-70">
            {config.label}
          </span>
          <h1 className="font-display text-4xl font-black leading-headline mt-4 md:text-6xl max-w-4xl">
            {article.title}
          </h1>
          <p className="font-mono text-meta uppercase tracking-mono mt-6 opacity-80">
            {new Date(article.date).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            · {article.readTime} min read · {article.wordCount} words
          </p>
        </div>
      </section>

      {article.heroImage && (
        <ArticleHeroImage
          src={article.heroImage}
          alt={article.heroImageConcept ?? article.title}
        />
      )}

      <section className="bg-cream py-16 px-6">
        <div className="mx-auto max-w-[1440px] grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-12">
          <article
            className={ARTICLE_PROSE_CLASS}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <div className="mb-8">
                <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-grey mb-3">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {article.tags.map((tag) => (
                    <span key={tag} className="font-mono text-meta-sm uppercase tracking-mono text-ink border border-ink px-2 py-1 rounded-sharp">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {related.length > 0 && (
        <section className="bg-ink py-16 px-6">
          <div className="mx-auto max-w-[1440px]">
            <h2 className="font-mono text-meta uppercase tracking-mono-wide text-cream mb-8">Read Next</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {related.map((a) => (
                <ArticleCard key={a.slug} article={a} dark />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

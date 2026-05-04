import { notFound } from "next/navigation";
import { getAnyArticleBySlug, renderMarkdown } from "@/lib/articles";
import { verticals } from "@/lib/verticals";
import { ArticleHeroImage } from "@/components/article-hero-image";
import { ReviewActionBar } from "@/components/review-action-bar";
import { ARTICLE_PROSE_CLASS, injectInlineImages } from "@/lib/article-html";
import type { Vertical } from "@/lib/types";

interface Props {
  params: Promise<{ vertical: string; slug: string }>;
}

export const dynamic = "force-dynamic";

const VALID_VERTICALS: Vertical[] = ["news", "sport", "tech", "features"];

function isVertical(v: string): v is Vertical {
  return (VALID_VERTICALS as string[]).includes(v);
}

export default async function ReviewArticlePage({ params }: Props) {
  const { vertical, slug } = await params;
  if (!isVertical(vertical)) notFound();

  const article = getAnyArticleBySlug(vertical, slug);
  if (!article) notFound();

  // The reject button is destructive; we only expose it from local dev to
  // avoid letting a public visitor discard articles.
  const isDev = process.env.NODE_ENV !== "production";

  const renderedHtml = await renderMarkdown(article.content);
  const htmlContent = injectInlineImages(renderedHtml, article.inlineImages);
  const config = verticals[article.category];

  return (
    <>
      {/* Pending banner so the page is unmistakably a preview. */}
      <div className="bg-orange text-ink py-3 px-6 text-center sticky top-0 z-40">
        <p className="font-mono text-meta-sm uppercase tracking-mono-wide">
          PREVIEW · status:{" "}
          <span className="font-bold">{article.status}</span> · this view is
          identical to the live article page
        </p>
      </div>

      <section className={`${config.bg} ${config.text} py-20 px-6`}>
        <div className="mx-auto max-w-[1440px]">
          <span className="font-mono text-meta-sm uppercase tracking-mono-wide opacity-70">
            {article.subjectName
              ? "BRILLIANT MINDS · SPOTLIGHT SERIES"
              : config.label}
          </span>
          <h1 className="font-display text-4xl font-black leading-headline mt-4 md:text-6xl max-w-4xl">
            {article.subjectName && (
              <span className="block font-display text-2xl md:text-4xl font-bold opacity-80 mb-3">
                Spotlight: {article.subjectName}
              </span>
            )}
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
              {article.editorNotes && (
                <div className="mb-8 border-t border-grey/30 pt-6">
                  <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-grey mb-3">Editor Notes</p>
                  <p className="font-body text-meta-sm leading-reading text-ink">
                    {article.editorNotes}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      {isDev ? (
        <ReviewActionBar
          vertical={article.category}
          slug={article.slug}
          title={article.title}
        />
      ) : (
        <div className="bg-ink text-cream py-6 px-6 border-t-4 border-orange">
          <div className="mx-auto max-w-[1200px]">
            <p className="font-mono text-meta-sm uppercase tracking-mono-wide opacity-70">
              Approve / Reject buttons are only enabled in local dev. Approve
              this piece from your local server.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

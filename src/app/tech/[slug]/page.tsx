import { notFound } from "next/navigation";
import { getArticleBySlug, getArticlesByVertical, renderMarkdown } from "@/lib/articles";
import { verticals } from "@/lib/verticals";
import { ArticleCard } from "@/components/article-card";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getArticlesByVertical("tech").map((a) => ({ slug: a.slug }));
}

export default async function TechArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticleBySlug("tech", slug);
  if (!article) notFound();

  const htmlContent = await renderMarkdown(article.content);
  const config = verticals.tech;
  const related = getArticlesByVertical("tech")
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

      <section className="bg-cream py-16 px-6">
        <div className="mx-auto max-w-[1440px] grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-12">
          <article
            className="font-body text-body leading-reading text-ink max-w-reading [&>h1]:font-display [&>h1]:text-4xl [&>h1]:font-bold [&>h1]:leading-headline [&>h1]:mt-12 [&>h1]:mb-4 [&>h2]:font-display [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:leading-headline [&>h2]:mt-12 [&>h2]:mb-4 [&>h3]:font-display [&>h3]:text-xl [&>h3]:font-bold [&>h3]:leading-headline [&>h3]:mt-8 [&>h3]:mb-3 [&>p]:mb-6 [&>blockquote]:border-l-4 [&>blockquote]:border-l-ink [&>blockquote]:pl-6 [&>blockquote]:italic [&>blockquote]:font-display [&>blockquote]:text-xl [&>blockquote]:my-8 [&>strong]:font-semibold [&>hr]:border-grey/30 [&>hr]:my-8 [&>p:first-of-type]:first-letter:text-6xl [&>p:first-of-type]:first-letter:font-display [&>p:first-of-type]:first-letter:font-black [&>p:first-of-type]:first-letter:float-left [&>p:first-of-type]:first-letter:mr-3 [&>p:first-of-type]:first-letter:mt-1 [&>p:first-of-type]:first-letter:leading-none"
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

import type { ArticleSource } from "@/lib/types";

/**
 * The restrained end-of-article source list. Renders nothing when the article
 * carries no sources — articles published before the field, or whose sources
 * were filtered out at parse, show no section at all rather than an empty one.
 */
export function ArticleSources({ sources }: { sources?: ArticleSource[] }) {
  if (!sources?.length) return null;

  return (
    <section aria-label="Sources" className="max-w-reading mt-12 pt-6 border-t border-grey/30">
      <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-grey mb-3">
        Sources
      </p>
      <ol className="space-y-2 list-none">
        {sources.map((source) => (
          <li key={source.url} className="font-body text-sm leading-reading text-ink/80">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 decoration-grey/60 hover:text-orange hover:decoration-orange"
            >
              {source.title}
            </a>
            {source.publisher && <span className="text-grey"> — {source.publisher}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

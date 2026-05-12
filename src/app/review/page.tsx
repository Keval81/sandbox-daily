import Link from "next/link";
import Image from "next/image";
import { getPendingArticles } from "@/lib/articles";
import { verticals } from "@/lib/verticals";

export const metadata = {
  title: "Review — Sandbox Daily",
  description: "Pending articles awaiting approval before going live.",
};

// Force dynamic rendering — review page must reflect filesystem state
// every time, not a build-time snapshot.
export const dynamic = "force-dynamic";

export default function ReviewIndexPage() {
  const pending = getPendingArticles();

  return (
    <section className="bg-cream min-h-screen py-16 px-6">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-12 border-b-2 border-ink pb-8">
          <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-orange mb-3">
            REVIEW QUEUE
          </p>
          <h1 className="font-display text-4xl md:text-6xl font-black leading-headline text-ink">
            {pending.length === 0
              ? "Nothing waiting on you"
              : `${pending.length} ${pending.length === 1 ? "piece" : "pieces"} awaiting approval`}
          </h1>
          {pending.length > 0 && (
            <p className="font-body text-body leading-reading text-ink mt-4 max-w-reading">
              Each piece below has cleared the editor and has its images. Open
              one, scroll the rendered page exactly as it will appear live, and
              approve or reject from the bottom of the article.
            </p>
          )}
        </header>

        {pending.length === 0 ? (
          <div className="bg-ink text-cream p-12 rounded-sharp text-center">
            <p className="font-mono text-meta uppercase tracking-mono-wide opacity-70">
              All caught up
            </p>
            <p className="font-display text-2xl font-bold mt-3">
              The pipeline is quiet.
            </p>
            <Link
              href="/"
              className="inline-block font-mono text-meta-sm uppercase tracking-mono-wide mt-6 underline"
            >
              ← Back to homepage
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {pending.map((article) => {
              const config = verticals[article.category];
              return (
                <li
                  key={`${article.category}/${article.slug}`}
                  className="border-2 border-ink rounded-sharp overflow-hidden bg-cream"
                >
                  <Link
                    href={`/review/${article.category}/${article.slug}`}
                    className="block group"
                  >
                    {article.heroImage && (
                      <div className="relative w-full aspect-[16/9] bg-ink">
                        <Image
                          src={article.heroImage}
                          alt={article.heroImageConcept ?? article.title}
                          fill
                          sizes="(max-width: 768px) 100vw, 600px"
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div className="p-6">
                      <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-orange mb-2">
                        {config.label} · PENDING
                        {article.revisionRound && article.revisionRound > 0
                          ? ` · ROUND ${article.revisionRound + 1}`
                          : ""}
                      </p>
                      <h2 className="font-display text-2xl font-bold leading-headline text-ink group-hover:opacity-70 transition-opacity">
                        {article.title}
                      </h2>
                      <p className="font-mono text-meta-sm uppercase tracking-mono mt-3 text-grey">
                        {new Date(article.date).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        {" · "}
                        {article.readTime} min read · {article.wordCount} words
                      </p>
                      <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-ink mt-4 underline">
                        Open preview →
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

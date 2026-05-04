import Link from "next/link";
import Image from "next/image";
import { verticals } from "@/lib/verticals";
import { getArticlesByVertical } from "@/lib/articles";
import { type Vertical } from "@/lib/types";
import { SectionCarousel } from "@/components/section-carousel";

const TILE_DEFINITIONS: ReadonlyArray<{
  vertical: Vertical;
  tagline: string;
}> = [
  {
    vertical: "news",
    tagline: "Breaking news, long-form reporting, opinion and analysis.",
  },
  {
    vertical: "tech",
    tagline: "AI, infrastructure, venture capital, digital culture.",
  },
  {
    vertical: "sport",
    tagline: "Elite sport, data-driven tactics, performance science.",
  },
  {
    vertical: "features",
    tagline:
      "Deep dives, long reads, and profiles of the people whose ideas are reshaping the present.",
  },
];

const ARTICLES_PER_TILE = 3;

export function VerticalStrip() {
  const strips = TILE_DEFINITIONS.map((def) => ({
    vertical: verticals[def.vertical],
    tagline: def.tagline,
    articles: getArticlesByVertical(def.vertical).slice(0, ARTICLES_PER_TILE),
  }));

  return (
    <section className="grid grid-cols-1 md:grid-cols-4">
      {strips.map((strip, i) => (
        <div
          key={strip.vertical.name}
          className={`${strip.vertical.bg} ${strip.vertical.text} relative overflow-hidden p-6 md:p-7 ${
            i < strips.length - 1 ? "md:border-r md:border-ink" : ""
          }`}
        >
          {strip.vertical.icon && (
            <Image
              src={strip.vertical.icon}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 25vw"
              className="object-cover mix-blend-multiply opacity-25 pointer-events-none"
            />
          )}

          <div className="relative z-10 flex h-full flex-col">
            {/*
              Header pinned to a fixed height so all 4 tiles' carousels
              start at the same y-line. Tagline is a single line; description
              clamps to 2 lines.
            */}
            <Link
              href={strip.vertical.route}
              className="block min-h-[112px] md:min-h-[124px] transition-opacity hover:opacity-90"
            >
              <span className="font-mono text-meta-sm uppercase tracking-mono-wide opacity-70">
                {strip.vertical.label}
              </span>
              <h2 className="font-display text-2xl md:text-2xl font-bold leading-headline mt-1.5 line-clamp-1">
                {strip.vertical.tagline}
              </h2>
              <p className="font-body text-xs leading-snug mt-1.5 opacity-90 line-clamp-2">
                {strip.tagline}
              </p>
            </Link>

            <div className="mt-4">
              <SectionCarousel
                articles={strip.articles}
                vertical={strip.vertical.name as Vertical}
                textClass={strip.vertical.text}
              />
            </div>

            <Link
              href={strip.vertical.route}
              className="font-mono text-meta-sm uppercase tracking-mono-wide mt-auto pt-4 inline-block opacity-80 hover:opacity-100 transition-opacity"
            >
              Read more →
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}

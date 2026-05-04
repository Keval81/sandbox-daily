"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  useCarousel,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { type Article, type Vertical } from "@/lib/types";

interface SectionCarouselProps {
  articles: Article[];
  vertical: Vertical;
  /** Tailwind text colour class — read from VerticalConfig. Drives dot tint. */
  textClass: string;
}

const VERTICAL_TO_ROUTE: Record<Vertical, string> = {
  news: "/news",
  sport: "/sport",
  tech: "/tech",
  features: "/features",
};

/**
 * Tiny dot indicator built on Embla's API. shadcn's stock carousel
 * doesn't ship dots; this stays in step with the active slide and
 * lets the user click to jump.
 */
function CarouselDots({ textClass }: { textClass: string }) {
  const { api } = useCarousel();
  const [selected, setSelected] = React.useState(0);
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    if (!api) return;
    const sync = () => {
      setCount(api.scrollSnapList().length);
      setSelected(api.selectedScrollSnap());
    };
    sync();
    api.on("reInit", sync);
    api.on("select", sync);
    return () => {
      api.off("reInit", sync);
      api.off("select", sync);
    };
  }, [api]);

  if (count <= 1) return null;

  return (
    <div className={cn("mt-2 flex justify-center gap-1.5", textClass)}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Go to slide ${i + 1}`}
          onClick={() => api?.scrollTo(i)}
          className={cn(
            "size-1.5 rounded-full bg-current transition-opacity",
            selected === i ? "opacity-100" : "opacity-30",
          )}
        />
      ))}
    </div>
  );
}

export function SectionCarousel({
  articles,
  vertical,
  textClass,
}: SectionCarouselProps) {
  if (articles.length === 0) {
    return (
      <div className="font-mono text-meta-sm uppercase tracking-mono-wide opacity-60 italic">
        No articles yet
      </div>
    );
  }

  const routePrefix = VERTICAL_TO_ROUTE[vertical];

  return (
    <Carousel className="w-full" opts={{ loop: false, align: "start" }}>
      {/*
        CarouselContent (Embla) handles slide layout + drag/swipe.
        Prev/Next chevrons override shadcn's default `-left-12`/`-right-12`
        outside-edge positioning so they sit just inside the thumbnail
        edges and centre vertically on the image.
      */}
      <CarouselContent className="-ml-2">
        {articles.map((article) => (
          <CarouselItem key={article.slug} className="pl-2">
            <Link
              href={`${routePrefix}/${article.slug}`}
              className="block group/slide"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-sm bg-ink/10">
                {article.heroImage ? (
                  <Image
                    src={article.heroImage}
                    alt={article.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover/slide:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-mono text-meta-sm uppercase opacity-50">
                    No image
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-2 pt-6">
                  <h3 className="font-display text-xs md:text-sm font-bold leading-tight text-cream line-clamp-2">
                    {article.title}
                  </h3>
                </div>
              </div>
            </Link>
          </CarouselItem>
        ))}
      </CarouselContent>

      <CarouselPrevious className="left-2 size-7 bg-cream/90 hover:bg-cream text-ink border-0 shadow-md" />
      <CarouselNext className="right-2 size-7 bg-cream/90 hover:bg-cream text-ink border-0 shadow-md" />

      <CarouselDots textClass={textClass} />
    </Carousel>
  );
}

import Image from "next/image";

interface ArticleHeroImageProps {
  src: string;
  alt: string;
  /**
   * Bypass next/image optimization (and its long-lived cache) for this hero.
   * Set on the review surface so revised heroes show through instead of the
   * optimizer returning the previous round's cached variant under the same URL.
   */
  unoptimized?: boolean;
}

export function ArticleHeroImage({ src, alt, unoptimized }: ArticleHeroImageProps) {
  return (
    <figure className="mx-auto max-w-[1440px] px-6 -mt-12 md:-mt-16 mb-4">
      <div className="relative w-full aspect-[16/9] overflow-hidden rounded-sharp bg-ink">
        <Image
          src={src}
          alt={alt}
          fill
          priority
          sizes="(max-width: 1440px) 100vw, 1440px"
          className="object-cover"
          unoptimized={unoptimized}
        />
      </div>
    </figure>
  );
}

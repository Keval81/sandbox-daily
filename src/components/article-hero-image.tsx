import Image from "next/image";

interface ArticleHeroImageProps {
  src: string;
  alt: string;
}

export function ArticleHeroImage({ src, alt }: ArticleHeroImageProps) {
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
        />
      </div>
    </figure>
  );
}

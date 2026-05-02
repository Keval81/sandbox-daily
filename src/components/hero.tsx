import Image from "next/image";
import { type Vertical } from "@/lib/types";
import { verticals } from "@/lib/verticals";

interface HeroProps {
  vertical: Vertical;
  headline: string;
  standfirst: string;
  children?: React.ReactNode;
}

export function Hero({ vertical, headline, standfirst, children }: HeroProps) {
  const config = verticals[vertical];

  return (
    <section className={`${config.bg} ${config.text} relative overflow-hidden py-24 px-6`}>
      {config.icon && (
        <Image
          src={config.icon}
          alt=""
          fill
          sizes="100vw"
          priority
          className="object-cover mix-blend-multiply opacity-25 pointer-events-none"
        />
      )}
      <div className="relative z-10 mx-auto max-w-[1440px]">
        <span className="font-mono text-meta uppercase tracking-mono-wide opacity-70">
          {config.label}
        </span>
        <h1 className="font-display text-5xl font-black leading-display mt-4 md:text-7xl">
          {headline}
        </h1>
        <p className="font-body text-body-lg leading-reading mt-6 max-w-reading opacity-90">
          {standfirst}
        </p>
        {children}
      </div>
    </section>
  );
}

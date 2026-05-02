import Link from "next/link";
import Image from "next/image";
import { verticals } from "@/lib/verticals";

export function VerticalStrip() {
  const strips = [
    { vertical: verticals.news, tagline: "Breaking news, long-form reporting, opinion and analysis." },
    { vertical: verticals.tech, tagline: "AI, infrastructure, venture capital, digital culture." },
    { vertical: verticals.sport, tagline: "Elite sport, data-driven tactics, performance science." },
    { vertical: verticals.features, tagline: "Deep dives, long reads, and profiles of the people whose ideas are reshaping the present." },
  ];

  return (
    <section className="grid grid-cols-1 md:grid-cols-4">
      {strips.map((strip, i) => (
        <Link
          key={strip.vertical.name}
          href={strip.vertical.route}
          className={`${strip.vertical.bg} ${strip.vertical.text} relative overflow-hidden p-8 md:p-12 group cursor-pointer min-h-[420px] md:min-h-[520px] ${
            i < strips.length - 1 ? "md:border-r md:border-ink" : ""
          }`}
        >
          {strip.vertical.icon && (
            <Image
              src={strip.vertical.icon}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 25vw"
              className="object-cover mix-blend-multiply opacity-25 transition-opacity duration-300 group-hover:opacity-40 pointer-events-none"
            />
          )}
          <div className="relative z-10 flex h-full flex-col">
            <span className="font-mono text-meta-sm uppercase tracking-mono-wide opacity-70">
              {strip.vertical.label}
            </span>
            <h2 className="font-display text-3xl font-bold leading-headline mt-3 group-hover:opacity-90 transition-opacity">
              {strip.vertical.tagline}
            </h2>
            <p className="font-body text-sm leading-reading mt-3 opacity-90">
              {strip.tagline}
            </p>
            <span className="font-mono text-meta-sm uppercase tracking-mono-wide mt-auto pt-6 inline-block opacity-80 group-hover:opacity-100 transition-opacity">
              Read more →
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}

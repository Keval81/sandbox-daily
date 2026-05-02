import Link from "next/link";
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
          className={`${strip.vertical.bg} ${strip.vertical.text} p-8 md:p-12 group cursor-pointer ${
            i < strips.length - 1 ? "md:border-r md:border-ink" : ""
          }`}
        >
          <span className="font-mono text-meta-sm uppercase tracking-mono-wide opacity-70">
            {strip.vertical.label}
          </span>
          <h2 className="font-display text-3xl font-bold leading-headline mt-3 group-hover:opacity-80 transition-opacity">
            {strip.vertical.tagline}
          </h2>
          <p className="font-body text-sm leading-reading mt-3 opacity-80">
            {strip.tagline}
          </p>
          <span className="font-mono text-meta-sm uppercase tracking-mono-wide mt-6 inline-block opacity-70 group-hover:opacity-100 transition-opacity">
            Read more →
          </span>
        </Link>
      ))}
    </section>
  );
}

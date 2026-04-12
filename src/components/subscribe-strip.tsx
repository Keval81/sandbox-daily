import { type Vertical } from "@/lib/types";
import { verticals } from "@/lib/verticals";

interface SubscribeStripProps {
  vertical?: Vertical;
  headline?: string;
  subtext?: string;
}

export function SubscribeStrip({
  vertical = "news",
  headline = "Intelligence, Delivered",
  subtext = "The sharpest analysis across News, Tech and Sport — direct to your inbox.",
}: SubscribeStripProps) {
  const config = verticals[vertical];

  return (
    <section className={`${config.bg} ${config.text} py-16 px-6`}>
      <div className="mx-auto max-w-[1440px] text-center">
        <h2 className="font-display text-4xl font-black leading-headline">
          {headline}
        </h2>
        <p className="font-body text-body leading-reading mt-4 max-w-reading mx-auto opacity-90">
          {subtext}
        </p>
        <button
          type="button"
          className="mt-8 bg-ink text-cream font-mono text-meta uppercase tracking-mono-wide px-8 py-3 rounded-sharp cursor-pointer hover:opacity-90 transition-opacity"
        >
          Subscribe
        </button>
      </div>
    </section>
  );
}

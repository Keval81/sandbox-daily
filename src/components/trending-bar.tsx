import { LiveIndicator } from "./live-indicator";

interface TrendingTopic {
  label: string;
  score: number;
}

interface TrendingBarProps {
  topics: TrendingTopic[];
}

export function TrendingBar({ topics }: TrendingBarProps) {
  return (
    <section className="bg-ink py-6 px-6">
      <div className="mx-auto max-w-[1440px] flex items-center gap-8 overflow-x-auto">
        <div className="flex items-center gap-3 shrink-0">
          <LiveIndicator />
          <span className="font-mono text-meta uppercase tracking-mono-wide text-cream">
            Trending Now
          </span>
        </div>
        <div className="flex items-center gap-6">
          {topics.map((topic) => (
            <div key={topic.label} className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-meta uppercase tracking-mono text-cream/80">
                {topic.label}
              </span>
              <span className="font-display text-lg font-bold text-accent">
                {topic.score}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

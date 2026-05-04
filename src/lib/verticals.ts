import { type Vertical, type VerticalConfig } from "./types";

export const verticals: Record<Vertical, VerticalConfig> = {
  news: {
    name: "news",
    label: "NEWS",
    bg: "bg-orange",
    text: "text-ink",
    navIndicator: "border-orange",
    tagline: "The Intelligence Briefing",
    route: "/news",
    icon: "/images/sections/news.webp",
  },
  sport: {
    name: "sport",
    label: "SPORT",
    bg: "bg-green",
    text: "text-cream",
    navIndicator: "border-accent",
    tagline: "The Performance Lab",
    route: "/sport",
    icon: "/images/sections/sport.webp",
  },
  tech: {
    name: "tech",
    label: "TECH",
    bg: "bg-cream",
    text: "text-ink",
    navIndicator: "border-cream",
    tagline: "The Circuit",
    route: "/tech",
    icon: "/images/sections/tech.webp",
  },
  features: {
    name: "features",
    label: "FEATURES",
    bg: "bg-ink",
    text: "text-cream",
    navIndicator: "border-orange",
    tagline: "The Long Read",
    route: "/features",
    icon: "/images/sections/features.webp",
  },
};

export function getVertical(name: string): VerticalConfig | undefined {
  return verticals[name as Vertical];
}

import type { Article, Vertical } from "@/lib/types";

export const HERO_COUNT = 4;
export const DEFAULT_PER_SECTION = 6;

const VERTICALS: readonly Vertical[] = ["news", "tech", "sport", "features"];

export interface HomepageSelection {
  hero: Article[];
  sections: Record<Vertical, Article[]>;
}

/**
 * The homepage's single selection pass.
 *
 * Three surfaces used to read the article store independently — the hero took
 * the newest 4, the grid the newest 9, each section tile the newest 3 of its
 * own vertical — so the lead story printed three times before a reader had
 * scrolled once. Claiming slugs in one place makes "no repeats" a property of
 * the code rather than a rule every future component has to remember.
 *
 * `articles` must arrive newest-first (what getAllArticles returns); the order
 * is preserved, never re-sorted, so the hero's lead stays the newest piece.
 */
export function selectHomepage(
  articles: Article[],
  perSection: number = DEFAULT_PER_SECTION
): HomepageSelection {
  const claimed = new Set<string>();

  const hero = articles.slice(0, HERO_COUNT);
  for (const a of hero) claimed.add(a.slug);

  const sections = Object.fromEntries(
    VERTICALS.map((vertical) => [
      vertical,
      articles
        .filter((a) => a.category === vertical && !claimed.has(a.slug))
        .slice(0, perSection),
    ])
  ) as Record<Vertical, Article[]>;

  // Recorded after the fact rather than during: a slug belongs to exactly one
  // vertical, so sections cannot collide with each other — but keeping the set
  // honest means anything added below this line inherits the guarantee.
  for (const list of Object.values(sections)) for (const a of list) claimed.add(a.slug);

  return { hero, sections };
}

export type Vertical = "news" | "sport" | "tech" | "features" | "spotlights";

export type ArticleStatus = "pending" | "published";

export interface InlineImage {
  path: string;
  concept: string;
}

export interface Article {
  slug: string;
  title: string;
  date: string;
  wordCount: number;
  tags: string[];
  category: Vertical;
  content: string;
  editedAt?: string;
  editorNotes?: string;
  readTime: number;
  heroImage?: string;
  heroImageConcept?: string;
  inlineImages?: InlineImage[];
  /** "pending" articles are filtered out of public listings — they only appear on /review. */
  status: ArticleStatus;
  /** For spotlights: subject's display name, used in cards and breadcrumbs. */
  subjectName?: string;
}

export interface VerticalConfig {
  name: string;
  label: string;
  bg: string;
  text: string;
  navIndicator: string;
  tagline: string;
  route: string;
}

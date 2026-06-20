export type Vertical = "news" | "sport" | "tech" | "features";

export interface QualityScore {
  proseVoice: number;
  structure: number;
  clarity: number;
  originality: number;
  sourcing: number;
  fairness: number;
  overall: number;
  tier: string;
  rationale: Record<string, string>;
  scoredAt: string;
}

export interface RelevanceScore {
  average: number;
  newsworthiness?: number;
  traction?: number;
  complexity?: number;
  uniqueness?: number;
}

export type ArticleStatus = "pending" | "published" | "revision-requested";

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
  /** How many revision passes this article has been through (0 = first draft). */
  revisionRound?: number;
  qualityScore?: QualityScore;
  relevanceScore?: RelevanceScore;
}

export interface VerticalConfig {
  name: string;
  label: string;
  bg: string;
  text: string;
  navIndicator: string;
  tagline: string;
  route: string;
  icon: string;
}

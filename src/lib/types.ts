export type Vertical = "news" | "sport" | "tech";

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

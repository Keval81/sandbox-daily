import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import {
  type Article,
  type ArticleStatus,
  type InlineImage,
  type Vertical,
} from "./types";

const contentDir = path.join(process.cwd(), "src/content");

function categoryToVertical(category: string): Vertical {
  if (category === "sports") return "sport";
  if (category === "spotlights") return "features";
  return category as Vertical;
}

function estimateReadTime(wordCount: number): number {
  return Math.ceil(wordCount / 200);
}

function parseArticleFile(dir: string, filename: string): Article {
  const filePath = path.join(dir, filename);
  const fileContents = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(fileContents);

  const inlineImages: InlineImage[] | undefined = Array.isArray(
    data.inline_images
  )
    ? (data.inline_images as Array<{ path?: unknown; concept?: unknown }>)
        .filter(
          (i) => typeof i?.path === "string" && typeof i?.concept === "string"
        )
        .map((i) => ({ path: i.path as string, concept: i.concept as string }))
    : undefined;

  // Default to "published" so the existing news/tech/sport/features pieces
  // (written before status was introduced) keep showing on the live site.
  const rawStatus = typeof data.status === "string" ? data.status : "published";
  const status: ArticleStatus =
    rawStatus === "pending" || rawStatus === "revision-requested"
      ? rawStatus
      : "published";

  return {
    slug: data.slug || filename.replace(/\.md$/, ""),
    title: data.title,
    date: data.date,
    wordCount: data.word_count || 0,
    tags: data.tags || [],
    category: categoryToVertical(data.category),
    content,
    editedAt: data.edited_at,
    editorNotes: data.editor_notes,
    readTime: estimateReadTime(data.word_count || 0),
    heroImage: data.hero_image,
    heroImageConcept: data.hero_image_concept,
    inlineImages,
    status,
    subjectName: typeof data.subject_name === "string" ? data.subject_name : undefined,
    revisionRound: typeof data.revision_round === "number" ? data.revision_round : undefined,
  };
}

function readVerticalDir(vertical: Vertical): Article[] {
  const dir = path.join(contentDir, vertical);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((filename) => parseArticleFile(dir, filename));
}

export function getArticlesByVertical(vertical: Vertical): Article[] {
  return readVerticalDir(vertical)
    .filter((a) => a.status === "published")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * All pending articles across every vertical — drives the /review surface.
 * Sorted most-recent first so newly-pipelined pieces float to the top.
 */
export function getPendingArticles(): Article[] {
  const verticals: Vertical[] = ["news", "sport", "tech", "features"];
  return verticals
    .flatMap((v) => readVerticalDir(v))
    .filter((a) => a.status === "pending" || a.status === "revision-requested")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Lookup any article (pending or published) by vertical+slug — needed by
 * /review/[slug] so we can render a piece before it goes live.
 */
export function getAnyArticleBySlug(
  vertical: Vertical,
  slug: string
): Article | undefined {
  return readVerticalDir(vertical).find((a) => a.slug === slug);
}

export function getArticleBySlug(
  vertical: Vertical,
  slug: string
): Article | undefined {
  const articles = getArticlesByVertical(vertical);
  return articles.find((a) => a.slug === slug);
}

export function getAllArticles(): Article[] {
  const verticals: Vertical[] = ["news", "sport", "tech", "features"];
  return verticals
    .flatMap((v) => getArticlesByVertical(v))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function renderMarkdown(content: string): Promise<string> {
  const result = await remark().use(html).process(content);
  return result.toString();
}

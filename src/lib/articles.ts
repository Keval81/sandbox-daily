import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import {
  type Article,
  type ArticleSource,
  type ArticleStatus,
  type InlineImage,
  type Vertical,
} from "./types";
import { parseQualityScore, parseRelevanceScore } from "./quality-score";
import { stripLeadingH1 } from "./strip-leading-h1";
import { byRecency } from "@/lib/articles/order";

const contentDir = path.join(process.cwd(), "src/content");

function categoryToVertical(category: string): Vertical {
  if (category === "sports") return "sport";
  if (category === "spotlights") return "features";
  return category as Vertical;
}

function estimateReadTime(wordCount: number): number {
  return Math.ceil(wordCount / 200);
}

/**
 * Parses one markdown file into an Article.
 *
 * Exported so a test can drive a real file through the same code the site
 * uses. Hand-built Article objects prove a rule and nothing about whether a
 * frontmatter key ever reaches it — which is exactly how the sport/sports
 * category bug and the seven-commit publish loop both got through.
 */
export function parseArticleFile(dir: string, filename: string): Article {
  const filePath = path.join(dir, filename);
  const fileContents = fs.readFileSync(filePath, "utf-8");

  // The empty options object opts out of gray-matter's process-wide cache, and
  // that is load-bearing. gray-matter stores the file object BEFORE it parses
  // the YAML (index.js:47, parse at :50), so a file that throws leaves behind a
  // cache entry whose `data` was never filled in. Every later parse of that
  // same content then returns empty frontmatter instead of throwing — which
  // means a malformed *pending* article comes back with no status and falls
  // through to the "published" default below, putting an unapproved draft on
  // the live site. Caching is only ever a win for byte-identical files; there
  // is no such thing here.
  const { data, content } = matter(fileContents, {});

  const inlineImages: InlineImage[] | undefined = Array.isArray(
    data.inline_images
  )
    ? (data.inline_images as Array<{ path?: unknown; concept?: unknown }>)
        .filter(
          (i) => typeof i?.path === "string" && typeof i?.concept === "string"
        )
        .map((i) => ({ path: i.path as string, concept: i.concept as string }))
    : undefined;

  const sources: ArticleSource[] | undefined = Array.isArray(data.sources)
    ? (data.sources as Array<{ title?: unknown; url?: unknown; publisher?: unknown }>)
        .filter(
          (s) =>
            typeof s?.title === "string" &&
            typeof s?.url === "string" &&
            /^https?:\/\//.test(s.url)
        )
        .map((s) => ({
          title: s.title as string,
          url: s.url as string,
          ...(typeof s.publisher === "string" ? { publisher: s.publisher } : {}),
        }))
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
    qualityScore: parseQualityScore(data as Record<string, unknown>),
    relevanceScore: parseRelevanceScore(data as Record<string, unknown>),
    standfirst: typeof data.standfirst === "string" ? data.standfirst : undefined,
    socialPost: typeof data.social_post === "string" ? data.social_post : undefined,
    originalTitle: typeof data.original_title === "string" ? data.original_title : undefined,
    homepageLead: data.homepage_lead === true,
    sources,
  };
}

/**
 * Every .md in one directory, minus the ones we cannot read.
 *
 * This used to be a bare .map, so a single file whose frontmatter opened on a
 * YAML indicator ("*", "'") threw out of the whole call and 500'd /review —
 * three bad articles took the entire operator queue down with them. A file the
 * parser chokes on now costs us that file and nothing else, named loudly
 * enough in the log to go and fix.
 */
export function parseArticleDir(dir: string): Article[] {
  if (!fs.existsSync(dir)) return [];

  const articles: Article[] = [];
  for (const filename of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    try {
      articles.push(parseArticleFile(dir, filename));
    } catch (err) {
      console.error(
        `[articles] unreadable frontmatter, skipping ${path.join(dir, filename)}`,
        err
      );
    }
  }
  return articles;
}

function readVerticalDir(vertical: Vertical): Article[] {
  return parseArticleDir(path.join(contentDir, vertical));
}

export function getArticlesByVertical(vertical: Vertical): Article[] {
  return readVerticalDir(vertical)
    .filter((a) => a.status === "published")
    .sort(byRecency);
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
    .sort(byRecency);
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
    .sort(byRecency);
}

export async function renderMarkdown(content: string): Promise<string> {
  const result = await remark().use(html).process(stripLeadingH1(content));
  return result.toString();
}

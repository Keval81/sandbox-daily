import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import { type Article, type Vertical } from "./types";

const contentDir = path.join(process.cwd(), "src/content");

function categoryToVertical(category: string): Vertical {
  if (category === "sports") return "sport";
  return category as Vertical;
}

function estimateReadTime(wordCount: number): number {
  return Math.ceil(wordCount / 200);
}

export function getArticlesByVertical(vertical: Vertical): Article[] {
  const dir = path.join(contentDir, vertical);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));

  return files
    .map((filename) => {
      const filePath = path.join(dir, filename);
      const fileContents = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(fileContents);

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
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getArticleBySlug(
  vertical: Vertical,
  slug: string
): Article | undefined {
  const articles = getArticlesByVertical(vertical);
  return articles.find((a) => a.slug === slug);
}

export function getAllArticles(): Article[] {
  const verticals: Vertical[] = ["news", "sport", "tech"];
  return verticals
    .flatMap((v) => getArticlesByVertical(v))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function renderMarkdown(content: string): Promise<string> {
  const result = await remark().use(html).process(content);
  return result.toString();
}

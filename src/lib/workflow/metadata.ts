import matter from "gray-matter";

export interface WorkflowMarkdownMetadata {
  title: string | null;
  slug: string | null;
  category: string | null;
  status: string | null;
  featureType: string | null;
  subjectName: string | null;
  date: string | null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function inferSlugFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, "");
}

export function titleFromSlug(slug: string): string {
  return slug
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function parseWorkflowMarkdown(raw: string): WorkflowMarkdownMetadata {
  const { data } = matter(raw);
  const rawDate = data.date;

  return {
    title: stringOrNull(data.title),
    slug: stringOrNull(data.slug),
    category: stringOrNull(data.category),
    status: stringOrNull(data.status),
    featureType: stringOrNull(data.feature_type),
    subjectName: stringOrNull(data.subject_name),
    date:
      typeof rawDate === "string"
        ? rawDate
        : rawDate instanceof Date
          ? rawDate.toISOString().slice(0, 10)
          : null,
  };
}

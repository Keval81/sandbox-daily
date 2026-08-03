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

/**
 * Research docs carry their headline as the first `# ` heading, not as
 * frontmatter — the writer only stamps `title` once it has written the piece.
 * Without this, every doc on the board was labelled from its filename, which
 * turns "BBC Future research" into "Bbc Future Research".
 */
function headingTitle(content: string): string | null {
  const match = content.match(/^#[ \t]+(.+)$/m);
  return match ? match[1].trim() : null;
}

export function parseWorkflowMarkdown(raw: string): WorkflowMarkdownMetadata {
  const { data, content } = matter(raw);
  const rawDate = data.date;

  return {
    title: stringOrNull(data.title) ?? headingTitle(content),
    slug: stringOrNull(data.slug),
    // `vertical` is what a promoted radar lead stamps; `category` is what the
    // editor stamps later. Same idea, two stages of the pipeline.
    category: stringOrNull(data.category) ?? stringOrNull(data.vertical),
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

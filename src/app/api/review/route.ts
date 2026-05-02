import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const VALID_VERTICALS = ["news", "sport", "tech", "features"] as const;
type Vertical = (typeof VALID_VERTICALS)[number];

const VALID_ACTIONS = ["approve", "reject"] as const;
type Action = (typeof VALID_ACTIONS)[number];

interface ReviewRequest {
  vertical: Vertical;
  slug: string;
  action: Action;
}

const CONTENT_ROOT = path.join(process.cwd(), "src/content");
const PUBLIC_IMAGES_ROOT = path.join(process.cwd(), "public/images/articles");
const DISCARD_ROOT = path.join(process.cwd(), ".review-discarded");

/**
 * Dev-only endpoint that approves or rejects a pending article.
 *
 * - Approve: flips frontmatter `status: pending` → `published` in place. The
 *   piece immediately shows on its vertical's listing.
 * - Reject: moves the markdown file plus all images that match the article's
 *   slug into `.review-discarded/{timestamp}-{slug}/` so they can be recovered.
 *
 * In production we 403 the endpoint entirely — approvals must happen from
 * local dev where physical access gates the action.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Not available in production" },
      { status: 403 }
    );
  }

  let body: ReviewRequest;
  try {
    body = (await request.json()) as ReviewRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { vertical, slug, action } = body ?? {};
  if (!vertical || !VALID_VERTICALS.includes(vertical)) {
    return NextResponse.json(
      { ok: false, error: `Invalid vertical: ${vertical}` },
      { status: 400 }
    );
  }
  if (!slug || typeof slug !== "string" || !/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json(
      { ok: false, error: `Invalid slug: ${slug}` },
      { status: 400 }
    );
  }
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, error: `Invalid action: ${action}` },
      { status: 400 }
    );
  }

  const articlePath = await findArticleFile(vertical, slug);
  if (!articlePath) {
    return NextResponse.json(
      { ok: false, error: `Article not found for ${vertical}/${slug}` },
      { status: 404 }
    );
  }

  if (action === "approve") {
    await approveArticle(articlePath);
    return NextResponse.json({ ok: true, action: "approved" });
  }

  await rejectArticle(articlePath, slug);
  return NextResponse.json({ ok: true, action: "rejected" });
}

async function findArticleFile(
  vertical: Vertical,
  slug: string
): Promise<string | null> {
  const dir = path.join(CONTENT_ROOT, vertical);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const filePath = path.join(dir, entry);
    const raw = await fs.readFile(filePath, "utf-8");
    const { data } = matter(raw);
    if (data.slug === slug || entry.replace(/\.md$/, "") === slug) {
      return filePath;
    }
  }
  return null;
}

async function approveArticle(articlePath: string): Promise<void> {
  const raw = await fs.readFile(articlePath, "utf-8");
  const parsed = matter(raw);
  parsed.data.status = "published";
  parsed.data.approved_at = new Date().toISOString();
  const next = matter.stringify(parsed.content, parsed.data);
  await fs.writeFile(articlePath, next, "utf-8");
}

async function rejectArticle(
  articlePath: string,
  slug: string
): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const discardDir = path.join(DISCARD_ROOT, `${stamp}-${slug}`);
  await fs.mkdir(discardDir, { recursive: true });

  // Move the markdown file.
  const articleDest = path.join(discardDir, path.basename(articlePath));
  await fs.rename(articlePath, articleDest);

  // Move every image whose name starts with the slug. Both hero (`{slug}.png`)
  // and inline images (`{slug}-inline-1.png`, etc.) share that prefix.
  let images: string[] = [];
  try {
    images = await fs.readdir(PUBLIC_IMAGES_ROOT);
  } catch {
    images = [];
  }
  const slugPrefix = slug.toLowerCase();
  for (const file of images) {
    const stem = file.replace(/\.(png|jpe?g|webp)$/i, "").toLowerCase();
    if (stem === slugPrefix || stem.startsWith(`${slugPrefix}-inline-`)) {
      const src = path.join(PUBLIC_IMAGES_ROOT, file);
      const dst = path.join(discardDir, file);
      try {
        await fs.rename(src, dst);
      } catch {
        // If a single image rename fails (e.g. permissions), keep going —
        // we'd rather discard most of it than block the whole reject.
      }
    }
  }
}

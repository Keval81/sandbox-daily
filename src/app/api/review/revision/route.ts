// src/app/api/review/revision/route.ts
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { validateRevisionRequestBody } from "@/lib/revision/validate";
import {
  createJobRecord,
  findActiveJobFor,
  spawnReviser,
} from "@/lib/revision/jobs";
import { REVIEW_REQUESTS_ROOT } from "@/lib/revision/paths";
import type { ReviewRequest } from "@/lib/revision/types";

const CONTENT_ROOT = path.join(process.cwd(), "src/content");

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Not available in production" },
      { status: 403 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateRevisionRequestBody(raw);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }
  const { vertical, slug } = validation.body;

  const articlePath = await findArticleFile(vertical, slug);
  if (!articlePath) {
    return NextResponse.json(
      { ok: false, error: `Article not found for ${vertical}/${slug}` },
      { status: 404 }
    );
  }

  const existing = await findActiveJobFor(vertical, slug);
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "Article is already in revision.", jobId: existing.id },
      { status: 409 }
    );
  }

  const articleRaw = await fs.readFile(articlePath, "utf-8");
  const parsed = matter(articleRaw);
  const round = typeof parsed.data.revision_round === "number" ? parsed.data.revision_round + 1 : 1;

  const fullRequest: ReviewRequest = {
    vertical,
    slug,
    round,
    submitted_at: new Date().toISOString(),
    overall_notes: validation.body.overall_notes,
    inline_comments: validation.body.inline_comments,
    image: validation.body.image,
  };

  const requestDir = path.join(REVIEW_REQUESTS_ROOT, vertical);
  await fs.mkdir(requestDir, { recursive: true });
  const requestPath = path.join(requestDir, `${slug}.review-request.json`);
  await fs.writeFile(requestPath, JSON.stringify(fullRequest, null, 2), "utf-8");

  parsed.data.status = "revision-requested";
  await fs.writeFile(articlePath, matter.stringify(parsed.content, parsed.data), "utf-8");

  const job = await createJobRecord({ slug, vertical });
  spawnReviser({
    jobId: job.jobId,
    slug,
    vertical,
    logPath: job.logPath,
  });

  return NextResponse.json({ ok: true, jobId: job.jobId, status: "queued" });
}

async function findArticleFile(
  vertical: ReviewRequest["vertical"],
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

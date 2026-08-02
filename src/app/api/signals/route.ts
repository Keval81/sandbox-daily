import { NextResponse } from "next/server";
import { readCounts } from "@/lib/signals/store";
import { isSlug } from "@/lib/signals/validate";

export const dynamic = "force-dynamic";

/** One page's worth. Above this a caller is scraping, not rendering. */
const MAX_SLUGS = 40;

/** Batched on purpose: one request per page, not one per card. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("slugs") ?? "";
  const slugs = raw.split(",").filter(isSlug).slice(0, MAX_SLUGS);
  const { ok, counts } = await readCounts(slugs);
  return NextResponse.json({ ok, counts });
}

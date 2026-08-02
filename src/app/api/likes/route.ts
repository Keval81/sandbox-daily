import { NextResponse } from "next/server";
import { recordLike, readCounts } from "@/lib/signals/store";
import { readSignalBody } from "@/lib/signals/validate";

export const dynamic = "force-dynamic";

/** A like, then the fresh pair back so the button can reconcile its optimism. */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = readSignalBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await recordLike(parsed.slug, parsed.deviceId);
  const { ok, counts } = await readCounts([parsed.slug]);
  return NextResponse.json({ ok, ...counts[parsed.slug] });
}

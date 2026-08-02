import { NextResponse } from "next/server";
import { recordView } from "@/lib/signals/store";
import { readSignalBody } from "@/lib/signals/validate";

export const dynamic = "force-dynamic";

/** Fire-and-forget: the reader is already reading, and nothing on the page is
 *  waiting on this. No body comes back. */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = readSignalBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await recordView(parsed.slug, parsed.deviceId);
  return new NextResponse(null, { status: 204 });
}

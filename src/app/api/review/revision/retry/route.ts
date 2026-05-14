import { NextResponse } from "next/server";
import { retryPersistedReviewRequest } from "@/lib/revision/jobs";
import { VERTICALS } from "@/lib/revision/types";
import type { ReviewRequest } from "@/lib/revision/types";

interface RetryBody {
  vertical?: unknown;
  slug?: unknown;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Not available in production" },
      { status: 403 }
    );
  }

  let body: RetryBody;
  try {
    body = (await request.json()) as RetryBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body.vertical !== "string" ||
    !VERTICALS.includes(body.vertical as ReviewRequest["vertical"])
  ) {
    return NextResponse.json(
      { ok: false, error: `Invalid vertical: ${body.vertical}` },
      { status: 400 }
    );
  }

  if (typeof body.slug !== "string" || !/^[a-z0-9-]+$/i.test(body.slug)) {
    return NextResponse.json(
      { ok: false, error: `Invalid slug: ${body.slug}` },
      { status: 400 }
    );
  }

  try {
    const result = await retryPersistedReviewRequest({
      vertical: body.vertical as ReviewRequest["vertical"],
      slug: body.slug,
    });
    return NextResponse.json({ ok: true, jobId: result.jobId, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retry revision";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

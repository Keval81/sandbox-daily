// src/app/api/review/revision/status/route.ts
import { NextResponse } from "next/server";
import { readJob } from "@/lib/revision/jobs";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Not available in production" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id || !/^[a-f0-9-]+$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });
  }

  const job = await readJob(id);
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, job });
}

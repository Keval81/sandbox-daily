"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  vertical: string;
  slug: string;
  title: string;
}

/**
 * Bottom-of-page sticky action bar shown only on /review/{vertical}/{slug}.
 * Calls the dev-only /api/review POST handler. Approve flips status to
 * "published"; Reject moves the article and its images to a discard
 * folder so they can be recovered if needed.
 */
export function ReviewActionBar({ vertical, slug, title }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  async function act(action: "approve" | "reject") {
    setError(null);
    if (action === "reject") {
      const ok = window.confirm(
        `Reject "${title}"? Images and the article will be moved to a discard folder. You can recover them manually if needed.`
      );
      if (!ok) return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vertical, slug, action }),
        });
        const body = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !body.ok) {
          setError(body.error ?? `${action} failed (HTTP ${res.status})`);
          return;
        }
        setDone(action === "approve" ? "approved" : "rejected");
        // Give the success banner a beat to register, then jump back to /review.
        setTimeout(() => router.push("/review"), 1200);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  if (done) {
    return (
      <div className="sticky bottom-0 z-50 bg-ink text-cream py-6 px-6 border-t-4 border-orange">
        <div className="mx-auto max-w-[1200px] flex items-center justify-between">
          <p className="font-mono text-meta uppercase tracking-mono-wide">
            ✓ {done === "approved" ? "Approved — now live" : "Rejected and moved to discard folder"}
          </p>
          <p className="font-mono text-meta-sm uppercase tracking-mono-wide opacity-70">
            Returning to queue…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 z-50 bg-cream border-t-2 border-ink py-6 px-6">
      <div className="mx-auto max-w-[1200px] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-orange">
            REVIEW
          </p>
          <p className="font-display text-lg font-bold text-ink leading-headline mt-1">
            Approve to publish, or reject to discard.
          </p>
          {error && (
            <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-red-700 mt-2">
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => act("reject")}
            className="font-mono text-meta uppercase tracking-mono-wide border-2 border-ink text-ink px-6 py-3 rounded-sharp hover:bg-ink hover:text-cream transition-colors disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => act("approve")}
            className="font-mono text-meta uppercase tracking-mono-wide bg-orange text-ink px-6 py-3 rounded-sharp hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {pending ? "Working…" : "Approve · Go Live"}
          </button>
        </div>
      </div>
    </div>
  );
}

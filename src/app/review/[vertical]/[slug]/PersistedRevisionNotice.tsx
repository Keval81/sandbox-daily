"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PersistedRevisionState } from "@/lib/revision/persisted-state";
import type { ReviewRequest } from "@/lib/revision/types";

interface Props {
  vertical: ReviewRequest["vertical"];
  slug: string;
  state: PersistedRevisionState | null;
  interactive: boolean;
}

export function PersistedRevisionNotice({
  vertical,
  slug,
  state,
  interactive,
}: Props) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state) return null;

  const retry = async () => {
    setRetrying(true);
    setError(null);
    const res = await fetch("/api/review/revision/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vertical, slug }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to retry revision");
      setRetrying(false);
      return;
    }
    router.refresh();
  };

  return (
    <PersistedRevisionNoticeContent
      state={state}
      interactive={interactive}
      retrying={retrying}
      error={error}
      onRetry={retry}
    />
  );
}

interface ContentProps {
  state: PersistedRevisionState;
  interactive: boolean;
  retrying: boolean;
  error: string | null;
  onRetry: () => void;
}

export function PersistedRevisionNoticeContent({
  state,
  interactive,
  retrying,
  error,
  onRetry,
}: ContentProps) {
  const title =
    state.job?.status === "error"
      ? "Revision job failed"
      : "Revision job in progress";

  return (
    <section className="mb-8 border-2 border-orange bg-cream p-5 rounded-sharp">
      <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-orange mb-2">
        {title}
      </p>
      <dl className="font-mono text-meta-sm text-ink space-y-1">
        <div>
          <dt className="inline uppercase text-grey">Status: </dt>
          <dd className="inline">{state.job?.status ?? "unknown"}</dd>
        </div>
        <div>
          <dt className="inline uppercase text-grey">Step: </dt>
          <dd className="inline">{state.job?.current_step ?? "unknown"}</dd>
        </div>
        {state.lastError && (
          <div>
            <dt className="inline uppercase text-grey">Last error: </dt>
            <dd className="inline">{state.lastError}</dd>
          </div>
        )}
        {state.job?.log_path && (
          <div>
            <dt className="inline uppercase text-grey">Log: </dt>
            <dd className="inline break-all">{state.job.log_path}</dd>
          </div>
        )}
      </dl>

      {state.canRetry && interactive && (
        <button
          type="button"
          className="mt-4 bg-ink text-cream px-5 py-2 font-mono uppercase tracking-mono-wide disabled:opacity-50"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? "Retrying..." : "Retry"}
        </button>
      )}

      {state.canRetry && !interactive && (
        <p className="font-mono text-meta-sm text-grey mt-4">
          Retry is only available from local dev.
        </p>
      )}

      {error && (
        <p className="text-orange font-mono text-meta-sm mt-3">{error}</p>
      )}
    </section>
  );
}

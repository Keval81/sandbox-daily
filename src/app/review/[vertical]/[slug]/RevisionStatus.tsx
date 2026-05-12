// src/app/review/[vertical]/[slug]/RevisionStatus.tsx
"use client";

import { useEffect, useState } from "react";
import type { JobRecord } from "@/lib/revision/types";

interface Props {
  jobId: string;
  onDone: () => void;
  onError: (error: string) => void;
}

const POLL_INTERVAL_MS = 2000;
const MAX_DURATION_MS = 5 * 60_000;

export function RevisionStatus({ jobId, onDone, onError }: Props) {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/review/revision/status?id=${jobId}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "Status check failed");
        const j = json.job as JobRecord;
        setJob(j);
        if (j.status === "done") {
          onDone();
          return;
        }
        if (j.status === "error") {
          onError(j.error ?? "Reviser reported error");
          return;
        }
        if (Date.now() - start > MAX_DURATION_MS) {
          setStuck(true);
          return;
        }
        setTimeout(tick, POLL_INTERVAL_MS);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        onError(msg);
      }
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [jobId, onDone, onError]);

  if (stuck) {
    return (
      <div className="border-2 border-ink bg-cream p-6 my-6 rounded-sharp">
        <p className="font-mono text-meta uppercase tracking-mono-wide text-orange mb-2">
          Job appears stuck
        </p>
        <p className="font-body text-body">
          Last update: {job?.current_step ?? "unknown"}.
        </p>
        <p className="font-mono text-meta-sm text-grey mt-2">
          Logs: <code>{job?.log_path}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="border-2 border-ink bg-cream p-6 my-6 rounded-sharp">
      <p className="font-mono text-meta uppercase tracking-mono-wide text-orange mb-2 animate-pulse">
        Re-drafting...
      </p>
      <p className="font-body text-body">{humanise(job?.current_step ?? "queued")}</p>
    </div>
  );
}

function humanise(step: string): string {
  switch (step) {
    case "queued": return "Queued.";
    case "starting": return "Starting up...";
    case "reading inputs": return "Reading your comments...";
    case "calling LLM": return "Asking the model for a fresh draft...";
    case "validating": return "Checking the output is sane...";
    case "writing revised draft": return "Writing the new draft...";
    case "regenerating image": return "Generating a new image...";
    case "completed": return "Almost done...";
    default: return step;
  }
}

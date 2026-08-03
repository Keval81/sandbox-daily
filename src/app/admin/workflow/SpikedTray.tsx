"use client";

import { Ban, FileText, PenLine } from "lucide-react";
import { useFormStatus } from "react-dom";
import { archiveWorkflowStory, forceWriteSpikedStory } from "./actions";
import type { WorkflowSpike } from "@/lib/workflow/types";

interface Props {
  spikes: WorkflowSpike[];
}

/** Disabled the moment it is pressed: the pipeline run behind it takes minutes,
 *  and a button that still looks live gets pressed again. */
function SubmitButton({
  children,
  className,
  pendingLabel,
}: {
  children: React.ReactNode;
  className: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * What the last override attempt actually did.
 *
 * "busy" is the one that matters: a pipeline run that cannot take the singleton
 * lock exits 0 having done nothing, so without saying so the board would show a
 * story that was never written as though the override had worked.
 */
function overrideNote(spike: WorkflowSpike): string | null {
  const job = spike.forceWrite;
  if (!job) return null;
  if (job.status === "running") return "Override running — writer, editor, then image";
  if (job.status === "busy") return "Pipeline was busy — nothing ran";
  if (job.status === "failed") return "Last override failed — check the log";
  return "Override finished, but the gate still lists this doc as spiked";
}

/**
 * The stories the writer's editorial gate declined to write.
 *
 * Deliberately not a column on the pipeline board: a spiked story is terminal
 * unless it is overruled here, and the board is already wider than a phone.
 * Renders nothing at all when there is nothing spiked.
 */
export function SpikedTray({ spikes }: Props) {
  if (spikes.length === 0) return null;

  return (
    <section className="border-b border-rose-400/30 bg-rose-500/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-rose-200">
          Spiked by the editorial gate · {spikes.length}
        </h2>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-rose-200/70">
          Scored below threshold — no article was written
        </p>
      </div>

      <ul className="divide-y divide-rose-400/20 px-5 pb-4">
        {spikes.map((spike) => (
          <li key={spike.id} className="py-4">
            <div className="flex flex-wrap items-center gap-2">
              {spike.vertical !== "unknown" && (
                <span className="rounded-full border border-rose-300/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-rose-100">
                  {spike.vertical}
                </span>
              )}
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-rose-200/70">
                {spike.ageLabel}
              </span>
            </div>

            <h3 className="mt-2 text-lg font-bold leading-tight text-slate-50">
              {spike.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-rose-50/85">
              {spike.reason}
            </p>

            <p className="mt-2 inline-flex items-center gap-2 font-mono text-[10px] text-slate-400">
              <FileText size={12} />
              {spike.sourcePath.split("/").pop()}
            </p>

            {overrideNote(spike) && (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-200">
                {overrideNote(spike)}
              </p>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {spike.forceWrite?.status === "running" ? (
                <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-600 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-slate-300">
                  <PenLine size={14} />
                  Writing…
                </span>
              ) : (
                <form action={forceWriteSpikedStory} className="contents">
                  <input type="hidden" name="filename" value={spike.sourcePath.split("/").pop()} />
                  <SubmitButton
                    pendingLabel="Starting…"
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-slate-100 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-950 disabled:opacity-50 sm:w-auto"
                  >
                    <PenLine size={14} />
                    {spike.forceWrite ? "Try again" : "Write anyway"}
                  </SubmitButton>
                </form>
              )}

              <form action={archiveWorkflowStory} className="flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="filePath" value={spike.sourcePath} />
                <input type="hidden" name="reason" value="spiked by the editorial gate" />
                <SubmitButton
                  pendingLabel="Binning…"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-600 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200 disabled:opacity-50 sm:w-auto"
                >
                  <Ban size={14} />
                  Bin it
                </SubmitButton>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

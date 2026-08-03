"use client";

import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  FileText,
  RotateCcw,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  archiveWorkflowStory,
  moveWorkflowStoryToSocialReady,
  retryWorkflowRevision,
} from "./actions";
import { SpikedTray } from "./SpikedTray";
import type {
  WorkflowAction,
  WorkflowDashboardData,
  WorkflowStage,
  WorkflowStory,
  WorkflowStoryType,
} from "@/lib/workflow/types";

interface WorkflowDashboardProps {
  data: WorkflowDashboardData;
}

type Filter =
  | "active"
  | "errors"
  | "actionable"
  | WorkflowStoryType
  | "published"
  | "archived";

const actionableActions = new Set<WorkflowAction>([
  "open-review",
  "retry-failed-job",
  "move-to-social-ready",
]);

const stageLabels: Record<WorkflowStage, string> = {
  research: "Research",
  writer: "Writer",
  editor: "Editor",
  "ready-image": "Ready Image",
  "image-agent": "Image Agent",
  "human-review": "Review",
  revision: "Revision",
  published: "Published",
};

function healthClass(health: WorkflowStory["health"]): string {
  if (health === "error") {
    return "border-rose-400/80 bg-rose-500/15 text-rose-50";
  }
  if (health === "stale") {
    return "border-amber-300/80 bg-amber-400/15 text-amber-50";
  }
  if (health === "warning") {
    return "border-yellow-300/80 bg-yellow-300/15 text-yellow-50";
  }
  return "border-slate-700 bg-slate-900 text-slate-100";
}

function storyMatchesFilter(story: WorkflowStory, filter: Filter): boolean {
  if (filter === "active") return story.stage !== "published";
  if (filter === "errors") {
    return story.health === "error" || story.health === "stale";
  }
  if (filter === "actionable") {
    return (
      story.stage !== "published" &&
      story.availableActions.some((action) => actionableActions.has(action))
    );
  }
  if (filter === "published") return story.stage === "published";
  return story.type === filter;
}

function ActionButton({
  action,
  story,
}: {
  action: WorkflowAction;
  story: WorkflowStory;
}) {
  if (action === "open-source" && (story.sourcePath || story.articlePath)) {
    return (
      <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-700 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400">
        <FileText size={14} />
        File available
      </span>
    );
  }
  if (action === "open-logs" && story.logPath) {
    return (
      <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-700 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400">
        <FileText size={14} />
        Log available
      </span>
    );
  }
  if (action === "open-review" && story.reviewPath) {
    return (
      <a
        href={story.reviewPath}
        className="inline-flex min-h-9 items-center gap-2 rounded-full bg-slate-100 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-950"
      >
        <ExternalLink size={14} />
        Review
      </a>
    );
  }
  if (action === "retry-failed-job") {
    return (
      <form action={retryWorkflowRevision}>
        <input type="hidden" name="slug" value={story.slug} />
        <input type="hidden" name="vertical" value={story.vertical} />
        <button className="inline-flex min-h-9 items-center gap-2 rounded-full bg-rose-100 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-950">
          <RotateCcw size={14} />
          Retry
        </button>
      </form>
    );
  }
  if (action === "move-to-social-ready" && story.articlePath) {
    return (
      <form action={moveWorkflowStoryToSocialReady}>
        <input type="hidden" name="articlePath" value={story.articlePath} />
        <input type="hidden" name="vertical" value={story.vertical} />
        <button className="inline-flex min-h-9 items-center gap-2 rounded-full bg-amber-100 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-950">
          <ArrowRight size={14} />
          Social Ready
        </button>
      </form>
    );
  }
  if (action === "archive-story" && (story.sourcePath || story.articlePath)) {
    return (
      <form action={archiveWorkflowStory} className="flex flex-wrap gap-2">
        <input
          type="hidden"
          name="filePath"
          value={story.sourcePath ?? story.articlePath}
        />
        <select
          name="reason"
          aria-label={`Archive reason for ${story.title}`}
          className="min-h-9 rounded-full border border-slate-700 bg-slate-950 px-3 text-[11px] font-semibold text-slate-200"
          defaultValue="not using"
        >
          <option value="not using">Not using</option>
          <option value="duplicate">Duplicate</option>
          <option value="failed pipeline">Failed pipeline</option>
          <option value="outdated">Outdated</option>
          <option value="other">Other</option>
        </select>
        <button className="inline-flex min-h-9 items-center gap-2 rounded-full bg-slate-800 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-100">
          Archive
        </button>
      </form>
    );
  }
  return null;
}

export function WorkflowDashboard({ data }: WorkflowDashboardProps) {
  const [filter, setFilter] = useState<Filter>("active");
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  function updateFilter(nextFilter: Filter) {
    setFilter(nextFilter);
    setSelectedStoryId(null);
  }

  const visibleStories = useMemo(
    () => data.stories.filter((story) => storyMatchesFilter(story, filter)),
    [data.stories, filter]
  );
  const selectedStory =
    data.stories.find((story) => story.id === selectedStoryId) ?? null;
  const activeStories = data.stories.filter((story) => story.stage !== "published");
  const boardStories = activeStories;
  const pipelineStages = data.stages.filter((stage) => stage.stage !== "published");
  const publishedCount =
    data.stages.find((stage) => stage.stage === "published")?.count ?? 0;
  const workflowTypes: WorkflowStoryType[] = ["normal", "feature", "spotlight"];
  const emptyDrilldownLabel =
    filter === "errors"
      ? "No stories need attention."
      : filter === "actionable"
        ? "No active stories need action."
        : filter === "active"
          ? "The active pipeline is clear."
          : `No ${filter} stories match this view.`;

  return (
    <main className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
      <section className="overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950 shadow-2xl shadow-black/30">
        <div className="grid grid-cols-1 border-b border-slate-800 md:grid-cols-[1.1fr_repeat(4,1fr)]">
          <div className="bg-slate-900 p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
              Sandbox Daily Ops
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-50">
              Content Control Room
            </h1>
          </div>
          {[
            ["Needs Attention", data.summary.needsAttention, "text-rose-300"],
            ["Actionable", data.summary.actionable, "text-amber-300"],
            ["In Flight", data.summary.inFlight, "text-slate-50"],
            ["Live Today", data.summary.liveToday, "text-emerald-300"],
          ].map(([label, value, className]) => (
            <div
              key={label}
              className="border-t border-slate-800 p-6 md:border-l md:border-t-0"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
                {label}
              </p>
              <p className={`mt-2 text-4xl font-black ${className}`}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {data.warnings.length > 0 && (
          <div className="border-b border-amber-300/30 bg-amber-300/10 px-6 py-3 text-sm text-amber-100">
            {data.warnings.slice(0, 2).map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}

        <SpikedTray spikes={data.spikes} />

        {/* min-w-0 on every child below: a grid item defaults to min-width:auto, so
           the 1180px pipeline board stretched this track past the viewport and the
           section's overflow-hidden clipped the overflow away instead of letting
           the inner overflow-x-auto scroll it. */}
        <div className="grid gap-5 p-3 sm:p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <h2 className="text-base font-bold text-slate-100">
                Live Pipeline Map
              </h2>
              <div className="flex flex-wrap gap-2">
                {(
                  ["active", "normal", "feature", "spotlight", "errors"] as Filter[]
                ).map((item) => (
                  <button
                    key={item}
                    onClick={() => updateFilter(item)}
                    className={`min-h-9 cursor-pointer rounded-full px-3 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-200 ${
                      filter === item
                        ? "bg-slate-100 text-slate-950"
                        : "border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                    }`}
                  >
                    {item}
                  </button>
                ))}
                <button
                  onClick={() => updateFilter("published")}
                  className={`min-h-9 cursor-pointer rounded-full px-3 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-200 ${
                    filter === "published"
                      ? "bg-slate-100 text-slate-950"
                      : "border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  }`}
                >
                  Published {publishedCount}
                </button>
                <button
                  onClick={() => updateFilter("archived")}
                  className={`min-h-9 cursor-pointer rounded-full px-3 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-200 ${
                    filter === "archived"
                      ? "bg-slate-100 text-slate-950"
                      : "border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  }`}
                >
                  Archived {data.archived.length}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto overscroll-x-contain p-3 sm:p-5">
              <div className="min-w-[1180px] space-y-2">
                <div className="grid grid-cols-[112px_repeat(7,minmax(130px,1fr))] gap-2">
                  <div className="flex items-end rounded-2xl border border-slate-800 bg-slate-950/60 p-3 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    Lane
                  </div>
                  {pipelineStages.map((stage) => {
                    const stageStories = boardStories.filter(
                      (story) => story.stage === stage.stage
                    );
                    return (
                      <button
                        key={stage.stage}
                        onClick={() => updateFilter("active")}
                        className={`min-h-28 cursor-pointer rounded-2xl border p-3 text-left transition-transform duration-200 hover:-translate-y-0.5 ${healthClass(
                          stage.health
                        )}`}
                      >
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-75">
                          {stageLabels[stage.stage]}
                        </span>
                        <strong className="mt-3 block text-3xl">
                          {stageStories.length}
                        </strong>
                        <span className="mt-2 block font-mono text-[11px] opacity-70">
                          active
                        </span>
                      </button>
                    );
                  })}
                </div>

                {workflowTypes.map((type) => (
                  <div
                    key={type}
                    className="grid grid-cols-[112px_repeat(7,minmax(130px,1fr))] gap-2"
                  >
                    <button
                      onClick={() => updateFilter(type)}
                      className="flex min-h-24 cursor-pointer items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/80 px-3 text-sm font-bold capitalize text-slate-200 transition-colors duration-200 hover:border-slate-600"
                    >
                      {type}
                    </button>
                    {pipelineStages.map((stage) => {
                      const laneStories = boardStories.filter(
                        (story) =>
                          story.type === type && story.stage === stage.stage
                      );
                      const previewStories = laneStories.slice(0, 4);
                      return (
                        <div
                          key={`${type}-${stage.stage}`}
                          className="min-h-24 rounded-2xl border border-slate-800 bg-slate-950/70 p-2"
                        >
                          {previewStories.length === 0 ? (
                            <span className="block rounded-xl border border-dashed border-slate-800 px-2 py-3 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-slate-700">
                              Clear
                            </span>
                          ) : (
                            <div className="space-y-1.5">
                              {previewStories.map((story) => (
                                <button
                                  key={story.id}
                                  title={story.title}
                                  onClick={() => setSelectedStoryId(story.id)}
                                  className={`w-full cursor-pointer rounded-xl border px-2 py-1.5 text-left text-[11px] font-semibold leading-snug transition-opacity duration-200 hover:opacity-80 ${
                                    selectedStoryId === story.id
                                      ? "ring-2 ring-slate-100"
                                      : ""
                                  } ${healthClass(
                                    story.health
                                  )}`}
                                >
                                  <span className="block w-full truncate text-left">
                                    {story.title}
                                  </span>
                                  <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] opacity-70">
                                    {story.health} · {story.ageLabel}
                                  </span>
                                </button>
                              ))}
                              {laneStories.length > previewStories.length && (
                                <button
                                  onClick={() => updateFilter(type)}
                                  className="w-full cursor-pointer rounded-xl border border-slate-700 px-2 py-1 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400 transition-colors duration-200 hover:text-slate-200"
                                >
                                  +{laneStories.length - previewStories.length} more
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {activeStories.length === 0 && (
            <section className="min-w-0 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-emerald-100 xl:col-span-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em]">
                Pipeline Clear
              </p>
              <h2 className="mt-2 text-2xl font-black">
                No active stories are waiting in the workflow.
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-emerald-100/80">
                Published and archived stories are still available through the
                filters above; this board is currently showing an empty active
                production pipeline.
              </p>
            </section>
          )}

          <aside className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <h2 className="text-base font-bold text-slate-100">
                {selectedStory ? "Selected Story" : "Exceptions Feed"}
              </h2>
              <AlertTriangle
                className={selectedStory ? "text-slate-300" : "text-amber-300"}
                size={18}
              />
            </div>
            <div className="space-y-3 p-4">
              {selectedStory ? (
                <article
                  className={`rounded-2xl border p-4 ${healthClass(
                    selectedStory.health
                  )}`}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-75">
                    {stageLabels[selectedStory.stage]} · {selectedStory.health} ·{" "}
                    {selectedStory.ageLabel}
                  </p>
                  <h3 className="mt-2 text-base font-black leading-tight">
                    {selectedStory.title}
                  </h3>
                  <p className="mt-2 break-all font-mono text-[10px] opacity-70">
                    {selectedStory.slug}
                  </p>
                  {selectedStory.latestError && (
                    <p className="mt-3 rounded-xl bg-rose-950/50 p-3 text-xs opacity-90">
                      {selectedStory.latestError}
                    </p>
                  )}
                  {(selectedStory.sourcePath ||
                    selectedStory.articlePath ||
                    selectedStory.logPath) && (
                    <div className="mt-3 space-y-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3 font-mono text-[10px] text-slate-300">
                      {selectedStory.sourcePath && (
                        <p className="break-all">Source: {selectedStory.sourcePath}</p>
                      )}
                      {selectedStory.articlePath && (
                        <p className="break-all">Article: {selectedStory.articlePath}</p>
                      )}
                      {selectedStory.logPath && (
                        <p className="break-all">Log: {selectedStory.logPath}</p>
                      )}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedStory.availableActions.length === 0 ? (
                      <span className="rounded-full border border-slate-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
                        No manual action
                      </span>
                    ) : (
                      selectedStory.availableActions.map((action) => (
                        <ActionButton
                          key={action}
                          action={action}
                          story={selectedStory}
                        />
                      ))
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedStoryId(null)}
                    className="mt-4 min-h-9 cursor-pointer rounded-full border border-slate-700 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300 transition-colors duration-200 hover:border-slate-500"
                  >
                    Back to exceptions
                  </button>
                </article>
              ) : data.exceptions.length === 0 ? (
                <p className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  No exceptions right now.
                </p>
              ) : (
                data.exceptions.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedStoryId(item.storyId)}
                    className={`rounded-2xl border p-4 ${healthClass(item.health)}`}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-75">
                      {item.ageLabel} · {stageLabels[item.stage]}
                    </p>
                    <h3 className="mt-2 text-sm font-bold leading-snug">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-xs opacity-80">{item.detail}</p>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <h2 className="text-base font-bold text-slate-100">
                {filter === "archived" ? "Archived Stories" : "Story Drill-Down"}
              </h2>
              <button
                onClick={() => updateFilter("actionable")}
                className="min-h-9 rounded-full border border-slate-700 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300"
              >
                Actionable
              </button>
            </div>
            <div className="overflow-x-auto">
              {filter === "archived" ? (
                data.archived.length === 0 ? (
                  <p className="m-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
                    No archived stories yet.
                  </p>
                ) : (
                <table className="w-full min-w-[860px] border-collapse text-left">
                  <thead className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Story</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Vertical</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Archived</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.archived.map((story) => (
                      <tr
                        key={story.id}
                        className="border-t border-slate-800 text-sm text-slate-300"
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-50">
                            {story.title}
                          </div>
                          <div className="mt-1 font-mono text-[10px] text-slate-500">
                            {story.slug}
                          </div>
                        </td>
                        <td className="px-4 py-3 capitalize">{story.type}</td>
                        <td className="px-4 py-3">{story.vertical}</td>
                        <td className="px-4 py-3">{story.reason ?? "No reason"}</td>
                        <td className="px-4 py-3">
                          {story.archivedAt
                            ? new Date(story.archivedAt).toLocaleDateString()
                            : "Unknown"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )
              ) : (
                visibleStories.length === 0 ? (
                  <p className="m-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
                    {emptyDrilldownLabel}
                  </p>
                ) : (
                <table className="w-full min-w-[980px] border-collapse text-left">
                  <thead className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Story</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Vertical</th>
                      <th className="px-4 py-3">Stage</th>
                      <th className="px-4 py-3">Health</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStories.map((story) => (
                      <tr
                        key={story.id}
                        className="border-t border-slate-800 text-sm text-slate-300"
                      >
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setSelectedStoryId(story.id)}
                            className="cursor-pointer text-left font-semibold text-slate-50 transition-colors duration-200 hover:text-white"
                          >
                            {story.title}
                          </button>
                          <div className="mt-1 font-mono text-[10px] text-slate-500">
                            {story.slug}
                          </div>
                        </td>
                        <td className="px-4 py-3 capitalize">{story.type}</td>
                        <td className="px-4 py-3">{story.vertical}</td>
                        <td className="px-4 py-3">{stageLabels[story.stage]}</td>
                        <td className="px-4 py-3">
                          {story.health} · {story.ageLabel}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {story.availableActions.map((action) => (
                              <ActionButton
                                key={action}
                                action={action}
                                story={story}
                              />
                            ))}
                            {(story.sourcePath ||
                              story.articlePath ||
                              story.logPath) && (
                              <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-700 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400">
                                <FileText size={14} />
                                File
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

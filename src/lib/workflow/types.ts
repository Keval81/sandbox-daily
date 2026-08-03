import type { ForceWriteJob } from "./force-write";

export const WORKFLOW_TYPES = ["normal", "feature", "spotlight"] as const;
export type WorkflowStoryType = (typeof WORKFLOW_TYPES)[number];

export const WORKFLOW_VERTICALS = [
  "news",
  "tech",
  "sport",
  "features",
  "review",
  "spotlights",
  "unknown",
] as const;
export type WorkflowVertical = (typeof WORKFLOW_VERTICALS)[number];

export const WORKFLOW_STAGES = [
  "research",
  "writer",
  "editor",
  "ready-image",
  "image-agent",
  "human-review",
  "revision",
  "published",
] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const WORKFLOW_HEALTH = ["ok", "stale", "warning", "error"] as const;
export type WorkflowHealth = (typeof WORKFLOW_HEALTH)[number];

export const WORKFLOW_ACTIONS = [
  "open-source",
  "open-review",
  "open-logs",
  "retry-failed-job",
  "move-to-social-ready",
  "archive-story",
] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

export function isWorkflowAction(value: unknown): value is WorkflowAction {
  return (
    typeof value === "string" &&
    WORKFLOW_ACTIONS.includes(value as WorkflowAction)
  );
}

export interface WorkflowStory {
  id: string;
  slug: string;
  title: string;
  type: WorkflowStoryType;
  vertical: WorkflowVertical;
  stage: WorkflowStage;
  health: WorkflowHealth;
  ageLabel: string;
  updatedAt: string | null;
  sourcePath?: string;
  articlePath?: string;
  reviewPath?: string;
  logPath?: string;
  latestError?: string;
  availableActions: WorkflowAction[];
}

export interface WorkflowArchivedStory {
  id: string;
  slug: string;
  title: string;
  type: WorkflowStoryType;
  vertical: WorkflowVertical;
  archivePath: string;
  reason: string | null;
  archivedAt: string | null;
}

/**
 * A research doc the writer's editorial gate declined to write.
 *
 * Not a pipeline stage: a spiked story is terminal unless the operator
 * overrules it, which is why these live in their own tray rather than in a
 * column on the board.
 */
export interface WorkflowSpike {
  id: string;
  slug: string;
  title: string;
  vertical: WorkflowVertical;
  sourcePath: string;
  /** The gate's own words, as recorded in articles-state.json. */
  reason: string;
  skippedAt: string;
  ageLabel: string;
  /** Present once the operator has overruled the gate for this doc. */
  forceWrite?: ForceWriteJob;
}

export interface WorkflowStageSummary {
  stage: WorkflowStage;
  count: number;
  health: WorkflowHealth;
  detail: string;
}

export interface WorkflowException {
  id: string;
  storyId: string;
  stage: WorkflowStage;
  health: Exclude<WorkflowHealth, "ok">;
  title: string;
  detail: string;
  ageLabel: string;
  action?: WorkflowAction;
}

export interface WorkflowSummary {
  needsAttention: number;
  actionable: number;
  manualMoves: number;
  inFlight: number;
  liveToday: number;
}

export interface WorkflowDashboardData {
  generatedAt: string;
  summary: WorkflowSummary;
  stages: WorkflowStageSummary[];
  stories: WorkflowStory[];
  spikes: WorkflowSpike[];
  archived: WorkflowArchivedStory[];
  exceptions: WorkflowException[];
  warnings: string[];
}

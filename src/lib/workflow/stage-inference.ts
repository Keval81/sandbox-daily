import type {
  WorkflowAction,
  WorkflowHealth,
  WorkflowStoryType,
  WorkflowVertical,
} from "./types";

export interface InferStoryTypeInput {
  sourceRootKind: "research" | "feature-research";
  filename: string;
  featureType?: string | null;
}

export function inferStoryType(input: InferStoryTypeInput): WorkflowStoryType {
  const lowerFilename = input.filename.toLowerCase();
  if (input.featureType === "spotlight" || lowerFilename.includes("spotlight")) {
    return "spotlight";
  }
  return input.sourceRootKind === "feature-research" ? "feature" : "normal";
}

export function normalizeVertical(
  category: string | null | undefined
): WorkflowVertical {
  if (category === "sports") return "sport";
  if (category === "sport") return "sport";
  if (category === "news") return "news";
  if (category === "tech") return "tech";
  if (category === "features") return "features";
  if (category === "review") return "review";
  if (category === "spotlights") return "spotlights";
  return "unknown";
}

export interface InferHealthInput {
  latestError?: string | null;
  isStale: boolean;
  hasWarning?: boolean;
}

export function inferHealth(input: InferHealthInput): WorkflowHealth {
  if (input.latestError) return "error";
  if (input.isStale) return "stale";
  if (input.hasWarning) return "warning";
  return "ok";
}

export interface BuildAvailableActionsInput {
  sourcePath?: string | null;
  reviewPath?: string | null;
  logPath?: string | null;
  canRetry: boolean;
  canMoveToSocialReady: boolean;
  canArchive?: boolean;
}

export function buildAvailableActions(
  input: BuildAvailableActionsInput
): WorkflowAction[] {
  const actions: WorkflowAction[] = [];
  if (input.sourcePath) actions.push("open-source");
  if (input.reviewPath) actions.push("open-review");
  if (input.logPath) actions.push("open-logs");
  if (input.canRetry) actions.push("retry-failed-job");
  if (input.canMoveToSocialReady) actions.push("move-to-social-ready");
  if (input.sourcePath && input.canArchive) actions.push("archive-story");
  return actions;
}

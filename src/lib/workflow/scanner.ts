import fs from "node:fs/promises";
import path from "node:path";
import { buildWorkflowPaths } from "./paths";
import {
  inferSlugFromFilename,
  parseWorkflowMarkdown,
  titleFromSlug,
} from "./metadata";
import {
  buildAvailableActions,
  inferHealth,
  inferStoryType,
  normalizeVertical,
} from "./stage-inference";
import {
  readEditorialSkips,
  readReviewJobs,
  type EditorialSkip,
} from "./state-readers";
import { readForceWriteJobs } from "./force-write";
import type { JobRecord } from "@/lib/revision/types";
import {
  WORKFLOW_STAGES,
  type WorkflowAction,
  type WorkflowArchivedStory,
  type WorkflowDashboardData,
  type WorkflowException,
  type WorkflowHealth,
  type WorkflowStage,
  type WorkflowStageSummary,
  type WorkflowStory,
  type WorkflowSpike,
} from "./types";

const ACTIVE_RESEARCH_WINDOW_DAYS = 7;
const ACTIONABLE_WORKFLOW_ACTIONS = new Set<WorkflowAction>([
  "open-review",
  "retry-failed-job",
  "move-to-social-ready",
]);

export interface ScanWorkflowInput {
  outputsRoot?: string;
  siteRoot?: string;
  now?: Date;
}

interface CandidateStory {
  slug: string;
  title: string;
  sourcePath?: string;
  articlePath?: string;
  reviewPath?: string;
  logPath?: string;
  latestError?: string;
  stage: WorkflowStage;
  type: WorkflowStory["type"];
  vertical: WorkflowStory["vertical"];
  updatedAt: string | null;
  canRetry: boolean;
  canMoveToSocialReady: boolean;
  canArchive: boolean;
}

interface ArchiveMetadata {
  reason: string | null;
  archivedAt: string | null;
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

async function listMarkdownFilesDeep(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        if (entry.name.startsWith(".")) return [];
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) return listMarkdownFilesDeep(entryPath);
        return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
      })
    );
    return files.flat();
  } catch {
    return [];
  }
}

async function readCandidateFromMarkdown(
  filePath: string,
  fallbackStage: WorkflowStage,
  sourceKind: "research" | "feature-research" | "article" | "site"
): Promise<CandidateStory> {
  const raw = await fs.readFile(filePath, "utf-8");
  const meta = parseWorkflowMarkdown(raw);
  const filename = path.basename(filePath);
  const slug = meta.slug ?? inferSlugFromFilename(filename);
  const type =
    sourceKind === "feature-research"
      ? inferStoryType({
          sourceRootKind: "feature-research",
          filename,
          featureType: meta.featureType,
        })
      : sourceKind === "research"
        ? "normal"
        : meta.featureType === "spotlight" ||
            filename.toLowerCase().includes("spotlight")
          ? "spotlight"
          : meta.category === "features" || meta.category === "spotlights"
            ? "feature"
          : "normal";

  const stats = await fs.stat(filePath);
  return {
    slug,
    title: meta.title ?? meta.subjectName ?? titleFromSlug(slug),
    sourcePath:
      sourceKind === "research" || sourceKind === "feature-research"
        ? filePath
        : undefined,
    articlePath: sourceKind === "article" ? filePath : undefined,
    reviewPath:
      sourceKind === "site"
        ? `/review/${normalizeVertical(meta.category)}/${slug}`
        : undefined,
    stage: fallbackStage,
    type,
    vertical: normalizeVertical(meta.category),
    updatedAt: stats.mtime.toISOString(),
    canRetry: false,
    canMoveToSocialReady: fallbackStage === "ready-image",
    canArchive:
      sourceKind === "research" ||
      sourceKind === "feature-research" ||
      fallbackStage === "ready-image" ||
      fallbackStage === "image-agent",
  };
}

async function readArchiveMetadata(filePath: string): Promise<ArchiveMetadata> {
  try {
    const raw = await fs.readFile(`${filePath}.archive.json`, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { reason: null, archivedAt: null };
    return {
      reason: typeof parsed.reason === "string" ? parsed.reason : null,
      archivedAt:
        typeof parsed.archivedAt === "string" ? parsed.archivedAt : null,
    };
  } catch {
    return { reason: null, archivedAt: null };
  }
}

async function readArchivedStory(filePath: string): Promise<WorkflowArchivedStory> {
  const sourceKind = filePath.includes(`${path.sep}research-docs-features${path.sep}`)
    ? "feature-research"
    : filePath.includes(`${path.sep}research-docs${path.sep}`)
      ? "research"
      : "article";
  const candidate = await readCandidateFromMarkdown(
    filePath,
    "published",
    sourceKind
  );
  const archive = await readArchiveMetadata(filePath);
  return {
    id: `archive:${candidate.slug}`,
    slug: candidate.slug,
    title: candidate.title,
    type: candidate.type,
    vertical: candidate.vertical,
    archivePath: filePath,
    reason: archive.reason,
    archivedAt: archive.archivedAt,
  };
}

function isWithinActiveResearchWindow(
  candidate: CandidateStory,
  now: Date
): boolean {
  if (!candidate.updatedAt) return false;
  const ageMs = now.getTime() - new Date(candidate.updatedAt).getTime();
  return ageMs <= ACTIVE_RESEARCH_WINDOW_DAYS * 24 * 3_600_000;
}

async function readSlugFromMarkdown(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath, "utf-8");
  const meta = parseWorkflowMarkdown(raw);
  return meta.slug ?? inferSlugFromFilename(path.basename(filePath));
}

async function collectCompletedArticleSlugs(files: string[]): Promise<Set<string>> {
  const slugs = new Set<string>();
  for (const file of files) {
    const slug = await readSlugFromMarkdown(file);
    slugs.add(slug);
    slugs.add(inferSlugFromFilename(path.basename(file)));
  }
  return slugs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function collectCompletedResearchFilenames(
  articlesRoot: string,
  completedArticleSlugs: Set<string>
): Promise<Set<string>> {
  const completedResearch = new Set<string>();
  try {
    const raw = await fs.readFile(
      path.join(articlesRoot, "articles-state.json"),
      "utf-8"
    );
    const state: unknown = JSON.parse(raw);
    if (!isRecord(state)) return completedResearch;

    const processed = isRecord(state.processed) ? state.processed : state;
    for (const [researchFilename, entry] of Object.entries(processed)) {
      if (!isRecord(entry) || typeof entry.article !== "string") continue;
      const articleSlug = inferSlugFromFilename(path.basename(entry.article));
      if (completedArticleSlugs.has(articleSlug)) {
        completedResearch.add(researchFilename);
      }
    }
  } catch {
    return completedResearch;
  }
  return completedResearch;
}

function ageLabel(updatedAt: string | null, now: Date): string {
  if (!updatedAt) return "unknown";
  const diffMs = Math.max(0, now.getTime() - new Date(updatedAt).getTime());
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 1) return `${Math.floor(diffMs / 60_000)}m old`;
  if (diffHours < 48) return `${diffHours}h old`;
  return `${Math.floor(diffHours / 24)}d old`;
}

function isStale(
  stage: WorkflowStage,
  updatedAt: string | null,
  now: Date
): boolean {
  if (!updatedAt || stage === "published") return false;
  const ageHours = (now.getTime() - new Date(updatedAt).getTime()) / 3_600_000;
  if (stage === "human-review" || stage === "ready-image") return ageHours >= 24;
  if (stage === "revision" || stage === "image-agent") return ageHours >= 2;
  return ageHours >= 48;
}

function toWorkflowStory(candidate: CandidateStory, now: Date): WorkflowStory {
  const health = inferHealth({
    latestError: candidate.latestError,
    isStale: isStale(candidate.stage, candidate.updatedAt, now),
    hasWarning: candidate.canMoveToSocialReady,
  });
  return {
    id: `${candidate.stage}:${candidate.slug}`,
    slug: candidate.slug,
    title: candidate.title,
    type: candidate.type,
    vertical: candidate.vertical,
    stage: candidate.stage,
    health,
    ageLabel: ageLabel(candidate.updatedAt, now),
    updatedAt: candidate.updatedAt,
    sourcePath: candidate.sourcePath,
    articlePath: candidate.articlePath,
    reviewPath: candidate.reviewPath,
    logPath: candidate.logPath,
    latestError: candidate.latestError,
    availableActions: buildAvailableActions({
      sourcePath: candidate.sourcePath ?? candidate.articlePath ?? null,
      reviewPath: candidate.reviewPath ?? null,
      logPath: candidate.logPath ?? null,
      canRetry: candidate.canRetry,
      canMoveToSocialReady: candidate.canMoveToSocialReady,
      canArchive: candidate.canArchive,
    }),
  };
}

function summarizeStages(stories: WorkflowStory[]): WorkflowStageSummary[] {
  return WORKFLOW_STAGES.map((stage) => {
    const matching = stories.filter((story) => story.stage === stage);
    const health: WorkflowHealth = matching.some(
      (story) => story.health === "error"
    )
      ? "error"
      : matching.some((story) => story.health === "stale")
        ? "stale"
        : matching.some((story) => story.health === "warning")
          ? "warning"
          : "ok";
    return {
      stage,
      count: matching.length,
      health,
      detail:
        matching.length === 0
          ? "clear"
          : `${matching.length} ${matching.length === 1 ? "story" : "stories"}`,
    };
  });
}

function buildExceptions(stories: WorkflowStory[]): WorkflowException[] {
  return stories
    .filter((story) => story.health !== "ok")
    .map((story) => ({
      id: `exception:${story.id}`,
      storyId: story.id,
      stage: story.stage,
      health: story.health === "ok" ? "warning" : story.health,
      title: story.title,
      detail: story.latestError ?? `${story.stage} requires attention`,
      ageLabel: story.ageLabel,
      action: story.availableActions.at(-1),
    }));
}

function toSpike(
  candidate: CandidateStory,
  sourcePath: string,
  skip: EditorialSkip,
  now: Date
): WorkflowSpike {
  // The gate's timestamp beats the file's mtime: it says when the decision was
  // made, not when the doc last happened to be touched.
  const skippedAt = skip.skippedAt || candidate.updatedAt || "";
  return {
    id: `spike:${candidate.slug}`,
    slug: candidate.slug,
    title: candidate.title,
    vertical: candidate.vertical,
    sourcePath,
    reason: skip.reason,
    skippedAt,
    ageLabel: ageLabel(skippedAt || null, now),
  };
}

function isActionableWorkflowStory(story: WorkflowStory): boolean {
  return (
    story.stage !== "published" &&
    story.availableActions.some((action) =>
      ACTIONABLE_WORKFLOW_ACTIONS.has(action)
    )
  );
}

function latestReviewJobsBySlug(jobs: JobRecord[]): Map<string, JobRecord> {
  const latest = new Map<string, JobRecord>();
  for (const job of jobs) {
    const existing = latest.get(job.slug);
    if (
      !existing ||
      new Date(job.updated_at).getTime() > new Date(existing.updated_at).getTime()
    ) {
      latest.set(job.slug, job);
    }
  }
  return latest;
}

export async function scanWorkflowDashboard(
  input: ScanWorkflowInput = {}
): Promise<WorkflowDashboardData> {
  const now = input.now ?? new Date();
  const paths = buildWorkflowPaths(input);
  const warnings: string[] = [];

  const researchFiles = await listMarkdownFiles(paths.researchDocsRoot);
  const featureResearchFiles = await listMarkdownFiles(
    paths.featureResearchDocsRoot
  );
  const readyImageFiles = await listMarkdownFilesDeep(paths.publishedRoot);
  const imageProcessedFiles = await listMarkdownFiles(
    path.join(paths.publishedRoot, ".image-processed")
  );
  const socialReadyFiles = await listMarkdownFilesDeep(paths.socialReadyRoot);
  const siteFiles = await listMarkdownFilesDeep(paths.siteContentRoot);
  const archiveFiles = await listMarkdownFilesDeep(paths.archiveRoot);
  const completedArticleSlugs = await collectCompletedArticleSlugs([
    ...imageProcessedFiles,
    ...siteFiles,
  ]);
  const completedResearchFilenames = await collectCompletedResearchFilenames(
    paths.articlesRoot,
    completedArticleSlugs
  );
  const reviewJobs = await readReviewJobs(paths.reviewJobsRoot);
  warnings.push(...reviewJobs.warnings);
  const editorialSkips = await readEditorialSkips(paths.articlesRoot);
  warnings.push(...editorialSkips.warnings);
  const forceWrites = await readForceWriteJobs(
    path.join(paths.outputsRoot, "force-write-jobs")
  );
  warnings.push(...forceWrites.warnings);
  const archived = await Promise.all(archiveFiles.map(readArchivedStory));

  const candidates: CandidateStory[] = [];
  const spikes: WorkflowSpike[] = [];

  // A spiked doc leaves the research column entirely. It is not waiting for the
  // writer — the writer has already refused it — and counting it in both places
  // would report the same story twice.
  const collectResearch = async (
    files: string[],
    sourceKind: "research" | "feature-research"
  ): Promise<void> => {
    for (const file of files) {
      const candidate = await readCandidateFromMarkdown(file, "research", sourceKind);
      const filename = path.basename(file);
      if (!isWithinActiveResearchWindow(candidate, now)) continue;
      if (completedResearchFilenames.has(filename)) continue;

      const skip = editorialSkips.skips.get(filename);
      if (skip) {
        spikes.push({
          ...toSpike(candidate, file, skip, now),
          forceWrite: forceWrites.jobs.get(filename),
        });
        continue;
      }
      candidates.push(candidate);
    }
  };

  await collectResearch(researchFiles, "research");
  await collectResearch(featureResearchFiles, "feature-research");
  for (const file of readyImageFiles) {
    const candidate = await readCandidateFromMarkdown(
      file,
      "ready-image",
      "article"
    );
    if (!completedArticleSlugs.has(candidate.slug)) {
      candidates.push(candidate);
    }
  }
  for (const file of socialReadyFiles) {
    candidates.push(await readCandidateFromMarkdown(file, "image-agent", "article"));
  }
  for (const file of siteFiles) {
    const candidate = await readCandidateFromMarkdown(file, "published", "site");
    const raw = await fs.readFile(file, "utf-8");
    const meta = parseWorkflowMarkdown(raw);
    candidate.stage =
      meta.status === "pending"
        ? "human-review"
        : meta.status === "revision-requested"
          ? "revision"
          : "published";
    candidates.push(candidate);
  }

  for (const job of latestReviewJobsBySlug(reviewJobs.jobs).values()) {
    if (
      job.status !== "error" &&
      job.status !== "queued" &&
      job.status !== "running"
    ) {
      continue;
    }
    const match = candidates.find((candidate) => candidate.slug === job.slug);
    if (!match) continue;
    match.stage = "revision";
    match.latestError = job.error ?? undefined;
    match.logPath = job.log_path;
    match.canRetry = job.status === "error";
    match.updatedAt = job.updated_at;
  }

  const stories = candidates.map((candidate) => toWorkflowStory(candidate, now));
  const exceptions = buildExceptions(stories);
  return {
    generatedAt: now.toISOString(),
    summary: {
      needsAttention: stories.filter(
        (story) => story.health === "error" || story.health === "stale"
      ).length,
      actionable: stories.filter(isActionableWorkflowStory).length,
      manualMoves: stories.filter((story) =>
        story.availableActions.includes("move-to-social-ready")
      ).length,
      inFlight: stories.filter((story) => story.stage !== "published").length,
      liveToday: stories.filter(
        (story) =>
          story.stage === "published" &&
          story.updatedAt?.startsWith(now.toISOString().slice(0, 10))
      ).length,
    },
    stages: summarizeStages(stories),
    stories,
    spikes: spikes.sort((a, b) => b.skippedAt.localeCompare(a.skippedAt)),
    archived,
    exceptions,
    warnings,
  };
}

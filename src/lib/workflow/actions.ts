import fs from "node:fs/promises";
import path from "node:path";
import { buildWorkflowPaths } from "./paths";
import type { WorkflowVertical } from "./types";

export interface MoveToSocialReadyInput {
  outputsRoot?: string;
  articlePath: string;
  vertical: WorkflowVertical;
}

export interface MoveToSocialReadyResult {
  ok: true;
  destinationPath: string;
}

export interface ArchiveWorkflowFileInput {
  outputsRoot?: string;
  filePath: string;
  reason: string;
}

export interface ArchiveWorkflowFileResult {
  ok: true;
  destinationPath: string;
}

function socialReadyFolderName(vertical: WorkflowVertical): string {
  if (vertical === "sport") return "sports";
  if (vertical === "news") return "news";
  if (vertical === "tech") return "tech";
  if (vertical === "features" || vertical === "spotlights") return "features";
  throw new Error(`Cannot move unknown vertical to social-ready: ${vertical}`);
}

function relativeEligibleArchivePath(filePath: string, outputsRoot: string): string {
  const sourcePath = path.resolve(filePath);
  const eligibleRoots = [
    "research-docs",
    "research-docs-features",
    "articles/published",
    "articles/social-ready",
  ].map((folder) => path.join(path.resolve(outputsRoot), folder));

  for (const root of eligibleRoots) {
    if (sourcePath.startsWith(`${root}${path.sep}`)) {
      return path.relative(path.resolve(outputsRoot), sourcePath);
    }
  }

  throw new Error(`File is not inside an eligible pipeline folder: ${filePath}`);
}

export async function moveToSocialReady(
  input: MoveToSocialReadyInput
): Promise<MoveToSocialReadyResult> {
  const paths = buildWorkflowPaths({ outputsRoot: input.outputsRoot });
  const sourcePath = path.resolve(input.articlePath);
  const publishedRoot = path.resolve(paths.publishedRoot);
  if (!sourcePath.startsWith(`${publishedRoot}${path.sep}`)) {
    throw new Error(`Article is not inside articles/published: ${input.articlePath}`);
  }
  if (!sourcePath.endsWith(".md")) {
    throw new Error(`Article must be a markdown file: ${input.articlePath}`);
  }

  const destinationDir = path.join(
    paths.socialReadyRoot,
    socialReadyFolderName(input.vertical)
  );
  const destinationPath = path.join(destinationDir, path.basename(sourcePath));
  await fs.mkdir(destinationDir, { recursive: true });

  try {
    await fs.access(destinationPath);
    throw new Error(`Destination already exists: ${destinationPath}`);
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? error.code
        : null;
    if (code !== "ENOENT") throw error;
  }

  await fs.rename(sourcePath, destinationPath);
  return { ok: true, destinationPath };
}

export async function archiveWorkflowFile(
  input: ArchiveWorkflowFileInput
): Promise<ArchiveWorkflowFileResult> {
  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new Error("Archive reason is required.");
  }

  const paths = buildWorkflowPaths({ outputsRoot: input.outputsRoot });
  const relativePath = relativeEligibleArchivePath(
    input.filePath,
    paths.outputsRoot
  );
  const sourcePath = path.resolve(input.filePath);
  if (!sourcePath.endsWith(".md")) {
    throw new Error(`Archive file must be a markdown file: ${input.filePath}`);
  }

  const destinationPath = path.join(paths.archiveRoot, relativePath);
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });

  try {
    await fs.access(destinationPath);
    throw new Error(`Archive destination already exists: ${destinationPath}`);
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? error.code
        : null;
    if (code !== "ENOENT") throw error;
  }

  await fs.rename(sourcePath, destinationPath);
  await fs.writeFile(
    `${destinationPath}.archive.json`,
    JSON.stringify(
      {
        reason,
        archivedAt: new Date().toISOString(),
        originalPath: sourcePath,
      },
      null,
      2
    ),
    "utf-8"
  );

  return { ok: true, destinationPath };
}

"use server";

import { revalidatePath } from "next/cache";
import { retryPersistedReviewRequest } from "@/lib/revision/jobs";
import type { WorkflowVertical } from "@/lib/workflow/types";
import { operatorSurfaceEnabled } from "@/lib/admin/surface";

function assertLocalOnly(): void {
  if (!operatorSurfaceEnabled()) {
    throw new Error("Workflow actions run only on the operator server (SANDBOX_ADMIN=1).");
  }
}

export async function moveWorkflowStoryToSocialReady(
  formData: FormData
): Promise<void> {
  assertLocalOnly();
  const articlePath = formData.get("articlePath");
  const vertical = formData.get("vertical");
  if (typeof articlePath !== "string" || articlePath.length === 0) {
    throw new Error("Missing article path.");
  }
  if (typeof vertical !== "string" || vertical.length === 0) {
    throw new Error("Missing vertical.");
  }
  const { moveToSocialReady } = await import("@/lib/workflow/actions");
  await moveToSocialReady({
    articlePath,
    vertical: vertical as WorkflowVertical,
  });
  revalidatePath("/admin/workflow");
}

export async function retryWorkflowRevision(
  formData: FormData
): Promise<void> {
  assertLocalOnly();
  const slug = formData.get("slug");
  const vertical = formData.get("vertical");
  if (typeof slug !== "string" || !/^[a-z0-9-]+$/i.test(slug)) {
    throw new Error("Invalid slug.");
  }
  if (
    vertical !== "news" &&
    vertical !== "sport" &&
    vertical !== "tech" &&
    vertical !== "features"
  ) {
    throw new Error("Invalid revision vertical.");
  }
  await retryPersistedReviewRequest({ slug, vertical });
  revalidatePath("/admin/workflow");
}

/**
 * Overrules the writer's editorial gate for one spiked research doc.
 *
 * Detached on purpose: the run behind this takes minutes (writer, editor,
 * image), far longer than a form post should hold open. Progress is reported
 * through the job record force-write.sh writes, which the board reads back.
 */
export async function forceWriteSpikedStory(formData: FormData): Promise<void> {
  assertLocalOnly();
  const filename = formData.get("filename");
  if (typeof filename !== "string" || filename.length === 0) {
    throw new Error("Missing research doc filename.");
  }

  const { buildForceWriteCommand, resolveResearchDoc } = await import(
    "@/lib/workflow/force-write"
  );
  const { WORKFLOW_PATHS } = await import("@/lib/workflow/paths");

  // Throws on anything that isn't a bare markdown filename — the value reaches
  // a shell command.
  const resolved = await resolveResearchDoc(WORKFLOW_PATHS.outputsRoot, filename);
  if (!resolved) {
    throw new Error(`No such research doc: ${filename}`);
  }

  const { spawn } = await import("node:child_process");
  const { command, args, cwd } = buildForceWriteCommand(
    WORKFLOW_PATHS.outputsRoot,
    filename
  );
  const child = spawn(command, args, { cwd, detached: true, stdio: "ignore" });
  child.unref();

  revalidatePath("/admin/workflow");
}

export async function archiveWorkflowStory(formData: FormData): Promise<void> {
  assertLocalOnly();
  const filePath = formData.get("filePath");
  const reason = formData.get("reason");
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new Error("Missing archive file path.");
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("Missing archive reason.");
  }
  const { archiveWorkflowFile } = await import("@/lib/workflow/actions");
  await archiveWorkflowFile({ filePath, reason });
  revalidatePath("/admin/workflow");
}

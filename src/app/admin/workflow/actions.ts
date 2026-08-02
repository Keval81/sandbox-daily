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

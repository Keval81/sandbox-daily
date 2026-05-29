import path from "node:path";

const HOME = process.env.HOME ?? "/Users/sandboxsansan";

export interface WorkflowRootInput {
  outputsRoot?: string;
  siteRoot?: string;
}

export interface WorkflowPaths {
  outputsRoot: string;
  siteRoot: string;
  researchDocsRoot: string;
  featureResearchDocsRoot: string;
  articlesRoot: string;
  archiveRoot: string;
  publishedRoot: string;
  socialReadyRoot: string;
  writerAgentRoot: string;
  editorAgentRoot: string;
  imageAgentRoot: string;
  reviewJobsRoot: string;
  reviewRequestsRoot: string;
  siteContentRoot: string;
  siteImagesRoot: string;
}

export function buildWorkflowPaths(
  input: WorkflowRootInput = {}
): WorkflowPaths {
  const outputsRoot =
    input.outputsRoot ??
    process.env.SSNN_OUTPUTS_ROOT ??
    path.join(HOME, "Desktop/ssnn-outputs");
  const siteRoot = input.siteRoot ?? process.cwd();

  return {
    outputsRoot,
    siteRoot,
    researchDocsRoot: path.join(outputsRoot, "research-docs"),
    featureResearchDocsRoot: path.join(outputsRoot, "research-docs-features"),
    articlesRoot: path.join(outputsRoot, "articles"),
    archiveRoot: path.join(outputsRoot, "archive"),
    publishedRoot: path.join(outputsRoot, "articles/published"),
    socialReadyRoot: path.join(outputsRoot, "articles/social-ready"),
    writerAgentRoot: path.join(outputsRoot, "writer-agent"),
    editorAgentRoot: path.join(outputsRoot, "editor-agent"),
    imageAgentRoot: path.join(outputsRoot, "image-agent"),
    reviewJobsRoot: path.join(outputsRoot, "review-jobs"),
    reviewRequestsRoot: path.join(outputsRoot, "review-requests"),
    siteContentRoot: path.join(siteRoot, "src/content"),
    siteImagesRoot: path.join(siteRoot, "public/images/articles"),
  };
}

export const WORKFLOW_PATHS = buildWorkflowPaths();

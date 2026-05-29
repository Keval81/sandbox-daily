import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorkflowPaths } from "./paths";

test("buildWorkflowPaths uses the supplied roots", () => {
  const paths = buildWorkflowPaths({
    outputsRoot: "/tmp/ssnn-outputs",
    siteRoot: "/tmp/site",
  });

  assert.equal(paths.researchDocsRoot, "/tmp/ssnn-outputs/research-docs");
  assert.equal(
    paths.featureResearchDocsRoot,
    "/tmp/ssnn-outputs/research-docs-features"
  );
  assert.equal(paths.articlesRoot, "/tmp/ssnn-outputs/articles");
  assert.equal(paths.reviewJobsRoot, "/tmp/ssnn-outputs/review-jobs");
  assert.equal(paths.siteContentRoot, "/tmp/site/src/content");
  assert.equal(paths.siteImagesRoot, "/tmp/site/public/images/articles");
});

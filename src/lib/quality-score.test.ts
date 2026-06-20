// sandbox-daily/src/lib/quality-score.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQualityScore, parseRelevanceScore } from "./quality-score";

test("parseQualityScore maps a full quality_score block to camelCase", () => {
  const q = parseQualityScore({
    quality_score: {
      prose_voice: 8,
      structure: 7,
      clarity: 8,
      originality: 6,
      sourcing: 7,
      fairness: 8,
      overall: 7.3,
      tier: "Strong",
      rationale: { prose_voice: "tight", sourcing: "attributed" },
      scored_at: "2026-06-20T10:00:00.000Z",
    },
  });
  assert.ok(q);
  assert.equal(q!.proseVoice, 8);
  assert.equal(q!.overall, 7.3);
  assert.equal(q!.tier, "Strong");
  assert.equal(q!.rationale.proseVoice, "tight");
  assert.equal(q!.rationale.sourcing, "attributed");
});

test("parseQualityScore returns undefined when block is absent or incomplete", () => {
  assert.equal(parseQualityScore({}), undefined);
  assert.equal(parseQualityScore({ quality_score: { overall: 7 } }), undefined);
});

test("parseRelevanceScore reads the pre-write editorial_score", () => {
  const r = parseRelevanceScore({
    editorial_score: { newsworthiness: 8, traction: 7, average: 7.3 },
  });
  assert.ok(r);
  assert.equal(r!.average, 7.3);
  assert.equal(r!.newsworthiness, 8);
});

test("parseRelevanceScore returns undefined without an average", () => {
  assert.equal(parseRelevanceScore({}), undefined);
  assert.equal(parseRelevanceScore({ editorial_score: { newsworthiness: 8 } }), undefined);
});

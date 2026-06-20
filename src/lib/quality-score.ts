// sandbox-daily/src/lib/quality-score.ts
import type { QualityScore, RelevanceScore } from "./types";

const AXIS_MAP: Record<string, keyof QualityScore> = {
  prose_voice: "proseVoice",
  structure: "structure",
  clarity: "clarity",
  originality: "originality",
  sourcing: "sourcing",
  fairness: "fairness",
};

function num(o: Record<string, unknown>, k: string): number | undefined {
  return typeof o[k] === "number" ? (o[k] as number) : undefined;
}

export function parseQualityScore(
  data: Record<string, unknown>
): QualityScore | undefined {
  const raw = data.quality_score;
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;

  const axisValues: Partial<Record<keyof QualityScore, number>> = {};
  for (const snake of Object.keys(AXIS_MAP)) {
    const v = num(o, snake);
    if (v === undefined) return undefined; // require all six axes
    axisValues[AXIS_MAP[snake]] = v;
  }
  const overall = num(o, "overall");
  if (overall === undefined) return undefined;

  const rationale: Record<string, string> = {};
  const ratRaw = o.rationale;
  if (typeof ratRaw === "object" && ratRaw !== null) {
    for (const [k, v] of Object.entries(ratRaw)) {
      const camel = AXIS_MAP[k];
      if (camel && typeof v === "string") rationale[camel] = v;
    }
  }

  return {
    proseVoice: axisValues.proseVoice!,
    structure: axisValues.structure!,
    clarity: axisValues.clarity!,
    originality: axisValues.originality!,
    sourcing: axisValues.sourcing!,
    fairness: axisValues.fairness!,
    overall,
    tier: typeof o.tier === "string" ? o.tier : "Publishable",
    rationale,
    scoredAt: typeof o.scored_at === "string" ? o.scored_at : "",
  };
}

export function parseRelevanceScore(
  data: Record<string, unknown>
): RelevanceScore | undefined {
  const raw = data.editorial_score;
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const average = num(o, "average");
  if (average === undefined) return undefined;
  return {
    average,
    newsworthiness: num(o, "newsworthiness"),
    traction: num(o, "traction"),
    complexity: num(o, "complexity"),
    uniqueness: num(o, "uniqueness"),
  };
}

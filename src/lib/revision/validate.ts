// src/lib/revision/validate.ts
import { VERTICALS } from "./types";
import type { ReviewRequest } from "./types";

export type ValidationResult =
  | { ok: true; body: Omit<ReviewRequest, "round" | "submitted_at"> }
  | { ok: false; error: string };

export function validateRevisionRequestBody(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Body must be an object." };
  }
  const body = input as Record<string, unknown>;

  if (typeof body.vertical !== "string" || !VERTICALS.includes(body.vertical as ReviewRequest["vertical"])) {
    return { ok: false, error: `Invalid vertical: ${body.vertical}` };
  }
  if (typeof body.slug !== "string" || !/^[a-z0-9-]+$/i.test(body.slug)) {
    return { ok: false, error: `Invalid slug: ${body.slug}` };
  }
  if (typeof body.overall_notes !== "string") {
    return { ok: false, error: "overall_notes must be a string." };
  }
  if (!Array.isArray(body.inline_comments)) {
    return { ok: false, error: "inline_comments must be an array." };
  }
  for (const c of body.inline_comments) {
    const cm = c as Record<string, unknown>;
    if (
      typeof cm.id !== "string" ||
      typeof cm.quote !== "string" ||
      typeof cm.paragraph_index !== "number" ||
      typeof cm.paragraph_text !== "string" ||
      typeof cm.preceding_context !== "string" ||
      typeof cm.following_context !== "string" ||
      typeof cm.comment !== "string" ||
      typeof cm.created_at !== "string"
    ) {
      return { ok: false, error: "Malformed inline comment." };
    }
  }
  if (typeof body.image !== "object" || body.image === null) {
    return { ok: false, error: "image must be an object." };
  }
  const image = body.image as Record<string, unknown>;
  if (typeof image.regenerate !== "boolean") {
    return { ok: false, error: "image.regenerate must be a boolean." };
  }
  if (image.context !== null && typeof image.context !== "string") {
    return { ok: false, error: "image.context must be a string or null." };
  }

  if (body.overall_notes.trim().length === 0 && body.inline_comments.length === 0) {
    return { ok: false, error: "Provide overall notes, at least one inline comment, or both." };
  }

  return {
    ok: true,
    body: {
      vertical: body.vertical as ReviewRequest["vertical"],
      slug: body.slug,
      overall_notes: body.overall_notes,
      inline_comments: body.inline_comments as ReviewRequest["inline_comments"],
      image: body.image as ReviewRequest["image"],
    },
  };
}

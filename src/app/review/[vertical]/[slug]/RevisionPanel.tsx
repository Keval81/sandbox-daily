// src/app/review/[vertical]/[slug]/RevisionPanel.tsx
"use client";

import { useState } from "react";
import type { InlineComment } from "@/lib/revision/types";

interface Props {
  comments: InlineComment[];
  overallNotes: string;
  setOverallNotes: (s: string) => void;
  imageRegen: boolean;
  setImageRegen: (b: boolean) => void;
  imageContext: string;
  setImageContext: (s: string) => void;
  highlightCommentId: (id: string) => void;
  updateComment: (id: string, comment: string) => void;
  removeComment: (id: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

export function RevisionPanel({
  comments,
  overallNotes,
  setOverallNotes,
  imageRegen,
  setImageRegen,
  imageContext,
  setImageContext,
  highlightCommentId,
  updateComment,
  removeComment,
  onCancel,
  onSubmit,
  submitting,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const canSubmit =
    !submitting && (overallNotes.trim().length > 0 || comments.length > 0);

  return (
    <aside
      className="fixed right-0 top-0 h-screen w-[360px] bg-cream border-l-2 border-ink overflow-y-auto z-40 p-6"
      aria-label="Revision drawer"
    >
      <header className="border-b-2 border-ink pb-4 mb-4">
        <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-orange">
          REQUEST REVISION
        </p>
      </header>

      <section className="mb-6">
        <label className="font-mono text-meta-sm uppercase tracking-mono-wide block mb-2">
          Overall notes
        </label>
        <textarea
          className="w-full border-2 border-ink rounded-sharp p-2 font-body text-body min-h-[120px]"
          value={overallNotes}
          onChange={(e) => setOverallNotes(e.target.value)}
          placeholder="Anything you want to say about the piece overall."
          disabled={submitting}
        />
      </section>

      <section className="mb-6">
        <p className="font-mono text-meta-sm uppercase tracking-mono-wide mb-2">
          Inline comments ({comments.length})
        </p>
        {comments.length === 0 && (
          <p className="font-body text-meta text-grey">
            Drag-select any text in the article to add a comment.
          </p>
        )}
        <ul className="space-y-3">
          {comments.map((c, idx) => (
            <li
              key={c.id}
              className="border-2 border-ink p-3 rounded-sharp cursor-pointer"
              onClick={() => highlightCommentId(c.id)}
            >
              <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-orange mb-1">
                {idx + 1} · ¶{c.paragraph_index + 1}
              </p>
              <p className="font-body text-meta italic mb-2">&ldquo;{c.quote}&rdquo;</p>
              {editingId === c.id ? (
                <textarea
                  className="w-full border-2 border-ink rounded-sharp p-2 font-body text-body"
                  value={c.comment}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateComment(c.id, e.target.value)}
                  onBlur={() => setEditingId(null)}
                  disabled={submitting}
                />
              ) : (
                <p
                  className="font-body text-body"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(c.id);
                  }}
                >
                  {c.comment || <span className="text-grey">(click to add comment)</span>}
                </p>
              )}
              <button
                type="button"
                className="mt-2 text-meta-sm font-mono uppercase text-grey hover:text-orange"
                onClick={(e) => {
                  e.stopPropagation();
                  removeComment(c.id);
                }}
                disabled={submitting}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <label className="flex items-center gap-2 font-mono text-meta-sm uppercase tracking-mono-wide cursor-pointer">
          <input
            type="checkbox"
            checked={imageRegen}
            onChange={(e) => setImageRegen(e.target.checked)}
            disabled={submitting}
          />
          Also regenerate the image
        </label>
        {imageRegen && (
          <textarea
            className="mt-2 w-full border-2 border-ink rounded-sharp p-2 font-body text-body min-h-[80px]"
            placeholder="What to change about the image (e.g., 'make sure it's Itauma, not Mo Ali')"
            value={imageContext}
            onChange={(e) => setImageContext(e.target.value)}
            disabled={submitting}
          />
        )}
      </section>

      <footer className="flex gap-2 pt-4 border-t-2 border-ink">
        <button
          type="button"
          className="flex-1 border-2 border-ink py-2 font-mono uppercase tracking-mono-wide hover:bg-ink hover:text-cream"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="flex-1 bg-ink text-cream py-2 font-mono uppercase tracking-mono-wide disabled:opacity-50"
          onClick={onSubmit}
          disabled={!canSubmit}
        >
          {submitting ? "Sending..." : "Send to reviser"}
        </button>
      </footer>
    </aside>
  );
}

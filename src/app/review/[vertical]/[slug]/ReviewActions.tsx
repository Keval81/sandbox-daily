// src/app/review/[vertical]/[slug]/ReviewActions.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewRequest } from "@/lib/revision/types";
import { useAnnotations } from "./use-annotations";
import { AnnotatableArticle } from "./AnnotatableArticle";
import { RevisionPanel } from "./RevisionPanel";
import { RevisionStatus } from "./RevisionStatus";

type Mode = "default" | "annotating" | "submitting";

interface Props {
  vertical: ReviewRequest["vertical"];
  slug: string;
  articleHtml: string;
}

export function ReviewActions({ vertical, slug, articleHtml }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("default");
  const [overallNotes, setOverallNotes] = useState("");
  const [imageRegen, setImageRegen] = useState(false);
  const [imageContext, setImageContext] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const annotations = useAnnotations();

  const callApi = async (action: "approve" | "reject") => {
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vertical, slug, action }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error ?? `Failed: ${action}`);
      return;
    }
    router.push("/review");
    router.refresh();
  };

  const submitRevision = async () => {
    setMode("submitting");
    setError(null);
    const res = await fetch("/api/review/revision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vertical,
        slug,
        overall_notes: overallNotes,
        inline_comments: annotations.comments,
        image: { regenerate: imageRegen, context: imageRegen ? imageContext : null },
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "Failed to submit revision");
      setMode("annotating");
      return;
    }
    setJobId(j.jobId);
  };

  const cancelAnnotation = () => {
    if (annotations.comments.length === 0 && overallNotes.trim().length === 0) {
      setMode("default");
      return;
    }
    setConfirmingCancel(true);
  };

  const confirmCancel = () => {
    annotations.clearAll();
    setOverallNotes("");
    setImageRegen(false);
    setImageContext("");
    setConfirmingCancel(false);
    setMode("default");
  };

  if (mode === "submitting" && jobId) {
    return (
      <RevisionStatus
        jobId={jobId}
        onDone={() => router.refresh()}
        onError={(msg) => {
          setError(msg);
          setMode("annotating");
          setJobId(null);
        }}
      />
    );
  }

  return (
    <>
      {mode === "annotating" ? (
        <AnnotatableArticle
          bodyHtml={articleHtml}
          comments={annotations.comments}
          onAddComment={(draft) => {
            const created = annotations.addComment(draft);
            setHighlightedId(created.id);
          }}
          onEditComment={(id) => setHighlightedId(id)}
          highlightedId={highlightedId}
        />
      ) : (
        <div
          className="prose prose-stone max-w-reading"
          dangerouslySetInnerHTML={{ __html: articleHtml }}
        />
      )}

      {mode === "annotating" && (
        <RevisionPanel
          comments={annotations.comments}
          overallNotes={overallNotes}
          setOverallNotes={setOverallNotes}
          imageRegen={imageRegen}
          setImageRegen={setImageRegen}
          imageContext={imageContext}
          setImageContext={setImageContext}
          highlightCommentId={setHighlightedId}
          updateComment={annotations.updateComment}
          removeComment={annotations.removeComment}
          onCancel={cancelAnnotation}
          onSubmit={submitRevision}
          submitting={false}
        />
      )}

      {mode === "default" && (
        <div className="flex gap-3 pt-8 border-t-2 border-ink mt-12">
          <button
            type="button"
            className="flex-1 bg-ink text-cream py-3 font-mono uppercase tracking-mono-wide"
            onClick={() => callApi("approve")}
          >
            Approve
          </button>
          <button
            type="button"
            className="flex-1 border-2 border-ink py-3 font-mono uppercase tracking-mono-wide hover:bg-ink hover:text-cream"
            onClick={() => setMode("annotating")}
          >
            Request revision
          </button>
          <button
            type="button"
            className="flex-1 border-2 border-ink py-3 font-mono uppercase tracking-mono-wide hover:bg-ink hover:text-cream"
            onClick={() => callApi("reject")}
          >
            Reject
          </button>
        </div>
      )}

      {error && (
        <p className="text-orange font-mono text-meta mt-4 border-2 border-orange p-3 rounded-sharp">
          {error}
        </p>
      )}

      {confirmingCancel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-cream border-2 border-ink p-6 rounded-sharp max-w-md">
            <p className="font-display text-2xl font-bold mb-3">
              Discard {annotations.comments.length} comment
              {annotations.comments.length === 1 ? "" : "s"}
              {overallNotes.trim().length > 0 ? " and your overall notes" : ""}?
            </p>
            <div className="flex gap-2 mt-4">
              <button
                className="flex-1 border-2 border-ink py-2 font-mono uppercase"
                onClick={() => setConfirmingCancel(false)}
              >
                Keep editing
              </button>
              <button
                className="flex-1 bg-ink text-cream py-2 font-mono uppercase"
                onClick={confirmCancel}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

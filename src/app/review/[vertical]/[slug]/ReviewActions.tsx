// src/app/review/[vertical]/[slug]/ReviewActions.tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewRequest } from "@/lib/revision/types";
import { canPromoteToLead } from "@/lib/homepage/lead";
import { useAnnotations } from "./use-annotations";
import { AnnotatableArticle } from "./AnnotatableArticle";
import { RevisionPanel } from "./RevisionPanel";
import { RevisionStatus } from "./RevisionStatus";

type Mode = "default" | "annotating" | "submitting";

interface Props {
  vertical: ReviewRequest["vertical"];
  slug: string;
  articleHtml: string;
  /** Action buttons + annotation drawer only render when true. */
  interactive: boolean;
  headline?: string;
  standfirst?: string;
  socialPost?: string;
  homepageLead?: boolean;
}

export function ReviewActions({ vertical, slug, articleHtml, interactive, headline, standfirst, socialPost, homepageLead }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("default");
  const [overallNotes, setOverallNotes] = useState("");
  const [imageRegen, setImageRegen] = useState(false);
  const [imageContext, setImageContext] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [editHeadline, setEditHeadline] = useState(headline ?? "");
  const [editStandfirst, setEditStandfirst] = useState(standfirst ?? "");
  const [editSocial, setEditSocial] = useState(socialPost ?? "");
  const [editLead, setEditLead] = useState(homepageLead ?? false);
  const annotations = useAnnotations();

  // Stable so AnnotatableArticle's applyHighlights effect doesn't re-run on every
  // parent render and stomp on an in-progress drag selection.
  const onEditComment = useCallback((id: string) => setHighlightedId(id), []);

  // Approve stages, commits and pushes — seconds of work, from a phone. Without
  // an in-flight guard the button just looks dead and gets tapped again; one
  // article once went out as seven commits, and seven production builds.
  const callApi = async (action: "approve" | "reject") => {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical,
          slug,
          action,
          fields:
            action === "approve"
              ? {
                  title: editHeadline,
                  standfirst: editStandfirst,
                  social_post: editSocial,
                  // Only sent where it means something. On news and features
                  // there is no checkbox, so there is nothing to say.
                  ...(canPromoteToLead(vertical) ? { homepage_lead: editLead } : {}),
                }
              : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? `Failed: ${action}`);
        setBusy(null);
        return;
      }
      // Deliberately stays busy through the navigation — re-enabling the button
      // while the page is still on screen is the same trap again.
      router.push("/review");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  const submitRevision = async () => {
    setMode("submitting");
    setError(null);
    // Send only the packaging fields the reviewer actually hand-edited — the
    // reviser keeps these verbatim and regenerates only the untouched ones.
    // Compared trimmed; an empty box is treated as "no override" (let the
    // reviser regenerate) rather than publishing a blank headline/dek/caption.
    const overrides: { title?: string; standfirst?: string; social_post?: string } = {};
    const changed = (edited: string, original?: string) =>
      edited.trim().length > 0 && edited.trim() !== (original ?? "").trim();
    if (changed(editHeadline, headline)) overrides.title = editHeadline.trim();
    if (changed(editStandfirst, standfirst)) overrides.standfirst = editStandfirst.trim();
    if (changed(editSocial, socialPost)) overrides.social_post = editSocial.trim();
    const res = await fetch("/api/review/revision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vertical,
        slug,
        overall_notes: overallNotes,
        inline_comments: annotations.comments,
        image: { regenerate: imageRegen, context: imageRegen ? imageContext : null },
        ...(Object.keys(overrides).length ? { overrides } : {}),
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
        onDone={() => {
          annotations.clearAll();
          setOverallNotes("");
          setImageRegen(false);
          setImageContext("");
          setError(null);
          setJobId(null);
          setMode("default");
          router.refresh();
        }}
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
          onEditComment={onEditComment}
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

      {mode === "default" && interactive && (
        <div className="mt-12 pt-8 border-t-2 border-ink space-y-5">
          <div>
            <label className="block font-mono text-meta-sm uppercase tracking-mono-wide text-grey mb-2">Headline</label>
            <input
              type="text"
              value={editHeadline}
              onChange={(e) => setEditHeadline(e.target.value)}
              className="w-full border-2 border-ink bg-cream px-3 py-2 font-display text-xl"
            />
          </div>
          <div>
            <label className="block font-mono text-meta-sm uppercase tracking-mono-wide text-grey mb-2">Standfirst</label>
            <textarea
              value={editStandfirst}
              onChange={(e) => setEditStandfirst(e.target.value)}
              rows={2}
              className="w-full border-2 border-ink bg-cream px-3 py-2 font-body"
            />
          </div>
          <div>
            <label className="block font-mono text-meta-sm uppercase tracking-mono-wide text-grey mb-2">
              X caption <span className={editSocial.length > 280 ? "text-orange" : "text-grey"}>· {editSocial.length}/280</span>
            </label>
            <textarea
              value={editSocial}
              onChange={(e) => setEditSocial(e.target.value)}
              rows={3}
              className="w-full border-2 border-ink bg-cream px-3 py-2 font-body"
            />
            <p className="font-mono text-meta-sm text-grey mt-2">
              Posting: post natively with the image, then drop the article link in your first reply (a link in the post suppresses reach).
            </p>
          </div>
          {canPromoteToLead(vertical) && (
            <label className="flex items-start gap-3 border-2 border-ink bg-cream px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editLead}
                onChange={(e) => setEditLead(e.target.checked)}
                className="mt-1 h-5 w-5 accent-orange"
              />
              <span>
                <span className="block font-mono text-meta-sm uppercase tracking-mono-wide">
                  Lead the front page
                </span>
                <span className="block font-mono text-meta-sm text-grey mt-1">
                  Sport and tech sit in the briefs by default. Ticked, this story
                  may take the lead — until something newer is published.
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      {mode === "default" && interactive && (
        <div className="flex gap-3 pt-8 border-t-2 border-ink mt-12">
          <button
            type="button"
            disabled={busy !== null}
            className="flex-1 bg-ink text-cream py-3 font-mono uppercase tracking-mono-wide disabled:opacity-50"
            onClick={() => callApi("approve")}
          >
            {busy === "approve" ? "Publishing…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            className="flex-1 border-2 border-ink py-3 font-mono uppercase tracking-mono-wide hover:bg-ink hover:text-cream disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-ink"
            onClick={() => setMode("annotating")}
          >
            Request revision
          </button>
          <button
            type="button"
            disabled={busy !== null}
            className="flex-1 border-2 border-ink py-3 font-mono uppercase tracking-mono-wide hover:bg-ink hover:text-cream disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-ink"
            onClick={() => callApi("reject")}
          >
            {busy === "reject" ? "Discarding…" : "Reject"}
          </button>
        </div>
      )}

      {mode === "default" && !interactive && (
        <div className="mt-12 pt-8 border-t-2 border-ink">
          <p className="font-mono text-meta-sm uppercase tracking-mono-wide opacity-70">
            Review actions are only enabled in local dev. Approve, request revision, or reject this piece from your local server.
          </p>
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

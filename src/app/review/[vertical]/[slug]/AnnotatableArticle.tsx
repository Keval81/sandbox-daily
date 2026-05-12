// src/app/review/[vertical]/[slug]/AnnotatableArticle.tsx
"use client";

import { memo, useEffect, useRef, useState, type Ref } from "react";
import type { InlineComment } from "@/lib/revision/types";
import { CommentPopover } from "./CommentPopover";

// Memoized so `setSelection` / parent re-renders don't cause React to re-apply
// `dangerouslySetInnerHTML`, which would tear down + rebuild every child node
// of the prose container and destroy the user's in-progress drag anchor.
const ArticleBody = memo(function ArticleBody({
  bodyHtml,
  innerRef,
}: {
  bodyHtml: string;
  innerRef: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={innerRef}
      className="prose prose-stone max-w-reading"
      dangerouslySetInnerHTML={{ __html: bodyHtml }}
    />
  );
});

interface SelectionInfo {
  paragraphIndex: number;
  charOffset: number;
  quote: string;
  rect: DOMRect;
  paragraphText: string;
  precedingContext: string;
  followingContext: string;
}

interface Props {
  bodyHtml: string;
  comments: InlineComment[];
  onAddComment: (draft: {
    quote: string;
    paragraph_index: number;
    paragraph_text: string;
    preceding_context: string;
    following_context: string;
    comment: string;
  }) => void;
  onEditComment: (id: string) => void;
  highlightedId: string | null;
}

export function AnnotatableArticle({
  bodyHtml,
  comments,
  onAddComment,
  onEditComment,
  highlightedId,
}: Props) {
  const articleRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);

  useEffect(() => {
    const handler = () => setSelection(captureSelection(articleRef.current, comments));
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [comments]);

  useEffect(() => {
    if (!articleRef.current) return;
    applyHighlights(articleRef.current, comments, onEditComment);
  }, [bodyHtml, comments, onEditComment]);

  useEffect(() => {
    if (!articleRef.current || !highlightedId) return;
    const el = articleRef.current.querySelector<HTMLElement>(`[data-comment-id="${highlightedId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-orange");
      setTimeout(() => el.classList.remove("ring-2", "ring-orange"), 1500);
    }
  }, [highlightedId]);

  const onAdd = () => {
    if (!selection) return;
    onAddComment({
      quote: selection.quote,
      paragraph_index: selection.paragraphIndex,
      paragraph_text: selection.paragraphText,
      preceding_context: selection.precedingContext,
      following_context: selection.followingContext,
      comment: "",
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="relative">
      <ArticleBody bodyHtml={bodyHtml} innerRef={articleRef} />
      {selection && <CommentPopover rect={selection.rect} onClick={onAdd} />}
    </div>
  );
}

function captureSelection(
  root: HTMLElement | null,
  _comments: InlineComment[]
): SelectionInfo | null {
  if (!root) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const paragraphs = Array.from(
    root.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,blockquote,li")
  );

  // Find the first paragraph the user's range touches. For a single-paragraph
  // drag this is the paragraph under the cursor; for a multi-paragraph drag
  // this is the topmost paragraph in the selection. Anchoring to one paragraph
  // means the reviser-agent gets one well-scoped target instead of a mixed quote.
  const paragraph = paragraphs.find((p) => rangeIntersectsNode(range, p));
  if (!paragraph) return null;
  const paragraphIndex = paragraphs.indexOf(paragraph);

  // Clip the range to that paragraph so the quote is text that actually lives
  // inside it — otherwise applyHighlights can't wrap it later.
  const clippedRange = clipRangeToNode(range, paragraph);
  const quote = clippedRange.toString().trim();
  if (!quote) return null;

  if (overlapsExistingHighlight(clippedRange, root)) return null;

  const paragraphText = paragraph.textContent ?? "";
  const precedingContext = paragraphs[paragraphIndex - 1]?.textContent ?? "";
  const followingContext = paragraphs[paragraphIndex + 1]?.textContent ?? "";
  const charOffset = paragraphText.indexOf(quote);

  return {
    paragraphIndex,
    charOffset: charOffset >= 0 ? charOffset : 0,
    quote,
    rect: clippedRange.getBoundingClientRect(),
    paragraphText,
    precedingContext,
    followingContext,
  };
}

function rangeIntersectsNode(range: Range, node: Node): boolean {
  const nodeRange = document.createRange();
  nodeRange.selectNodeContents(node);
  return (
    range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
  );
}

function clipRangeToNode(range: Range, node: Node): Range {
  const nodeRange = document.createRange();
  nodeRange.selectNodeContents(node);
  const clipped = range.cloneRange();
  if (range.compareBoundaryPoints(Range.START_TO_START, nodeRange) < 0) {
    clipped.setStart(nodeRange.startContainer, nodeRange.startOffset);
  }
  if (range.compareBoundaryPoints(Range.END_TO_END, nodeRange) > 0) {
    clipped.setEnd(nodeRange.endContainer, nodeRange.endOffset);
  }
  return clipped;
}

function overlapsExistingHighlight(range: Range, root: HTMLElement): boolean {
  const marks = root.querySelectorAll("mark[data-comment-id]");
  for (const mark of Array.from(marks)) {
    const r = document.createRange();
    r.selectNode(mark);
    const startsInside =
      range.compareBoundaryPoints(Range.START_TO_START, r) >= 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, r) <= 0;
    const endsInside =
      range.compareBoundaryPoints(Range.END_TO_START, r) >= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, r) <= 0;
    const wraps =
      range.compareBoundaryPoints(Range.START_TO_START, r) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, r) >= 0;
    if (startsInside || endsInside || wraps) return true;
  }
  return false;
}

function applyHighlights(
  root: HTMLElement,
  comments: InlineComment[],
  onEditComment: (id: string) => void
): void {
  // Strip prior marks first.
  root.querySelectorAll("mark[data-comment-id]").forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
  });

  const paragraphs = Array.from(root.querySelectorAll("p,h1,h2,h3,h4,blockquote,li"));
  comments.forEach((c, idx) => {
    const para = paragraphs[c.paragraph_index];
    if (!para) return;
    wrapFirstMatchingTextNode(para, c.quote, c.id, idx + 1, onEditComment);
  });
}

function wrapFirstMatchingTextNode(
  paragraph: Element,
  quote: string,
  commentId: string,
  number: number,
  onEditComment: (id: string) => void
): void {
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let node: Text | null = walker.nextNode() as Text | null;
  while (node) {
    const idx = node.textContent?.indexOf(quote) ?? -1;
    if (idx >= 0 && node.textContent) {
      const before = node.textContent.slice(0, idx);
      const after = node.textContent.slice(idx + quote.length);
      const mark = document.createElement("mark");
      mark.dataset.commentId = commentId;
      mark.style.backgroundColor = "rgba(231, 93, 49, 0.20)";
      mark.style.cursor = "pointer";
      mark.appendChild(document.createTextNode(quote));

      const sup = document.createElement("sup");
      sup.textContent = String(number);
      sup.style.color = "#E75D31";
      sup.style.fontWeight = "700";
      sup.style.marginLeft = "2px";
      mark.appendChild(sup);

      mark.addEventListener("click", (e) => {
        e.stopPropagation();
        onEditComment(commentId);
      });

      const parent = node.parentNode;
      if (!parent) return;
      parent.insertBefore(document.createTextNode(before), node);
      parent.insertBefore(mark, node);
      parent.insertBefore(document.createTextNode(after), node);
      parent.removeChild(node);
      return;
    }
    node = walker.nextNode() as Text | null;
  }
}

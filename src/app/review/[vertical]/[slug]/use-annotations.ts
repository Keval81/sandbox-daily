// src/app/review/[vertical]/[slug]/use-annotations.ts
"use client";

import { useCallback, useState } from "react";
import type { InlineComment } from "@/lib/revision/types";

export type DraftComment = Omit<InlineComment, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export interface UseAnnotationsResult {
  comments: InlineComment[];
  addComment: (draft: DraftComment) => InlineComment;
  updateComment: (id: string, comment: string) => void;
  removeComment: (id: string) => void;
  clearAll: () => void;
}

let counter = 0;
const newId = () => {
  counter += 1;
  return `c${Date.now()}-${counter}`;
};

export function useAnnotations(): UseAnnotationsResult {
  const [comments, setComments] = useState<InlineComment[]>([]);

  const addComment = useCallback((draft: DraftComment): InlineComment => {
    const id = draft.id ?? newId();
    const created_at = draft.created_at ?? new Date().toISOString();
    const next: InlineComment = {
      id,
      created_at,
      quote: draft.quote,
      paragraph_index: draft.paragraph_index,
      paragraph_text: draft.paragraph_text,
      preceding_context: draft.preceding_context,
      following_context: draft.following_context,
      comment: draft.comment,
    };
    setComments((prev) => sortByParagraphThenOffset([...prev, next]));
    return next;
  }, []);

  const updateComment = useCallback((id: string, comment: string) => {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, comment } : c)));
  }, []);

  const removeComment = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => setComments([]), []);

  return { comments, addComment, updateComment, removeComment, clearAll };
}

function sortByParagraphThenOffset(list: InlineComment[]): InlineComment[] {
  return [...list].sort((a, b) => a.paragraph_index - b.paragraph_index);
}

"use client";

import { useState, type MouseEvent } from "react";
import { getDeviceId } from "@/lib/signals/device";

interface Props {
  slug: string;
  /** Omit to render the thumb alone — the card treatment. */
  count?: number;
  className?: string;
}

/**
 * Optimistic by design: the thumb fills and the count moves on tap, because a
 * reader liking a story has no interest in waiting for a round trip. A failed
 * write rolls the optimism back rather than leaving a lie on screen.
 *
 * The server is the real arbiter — the (slug, device) primary key means a
 * second tap changes nothing there, so `liked` latching true locally is the
 * honest mirror of what the database will do.
 */
export function LikeButton({ slug, count, className = "" }: Props) {
  const [liked, setLiked] = useState(false);
  const [delta, setDelta] = useState(0);
  const [busy, setBusy] = useState(false);

  const like = async (e: MouseEvent<HTMLButtonElement>) => {
    // Cards wrap their content in a Link and this button sits over it: without
    // these two the tap would navigate instead of liking.
    e.preventDefault();
    e.stopPropagation();
    if (liked || busy) return;

    setLiked(true);
    setDelta(1);
    setBusy(true);
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, deviceId: getDeviceId() }),
      });
      if (!res.ok) throw new Error(`like failed: ${res.status}`);
    } catch {
      setLiked(false);
      setDelta(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={like}
      aria-pressed={liked}
      aria-label={liked ? "Liked" : "Like this story"}
      className={`sd-like ${liked ? "sd-like--on" : ""} ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      >
        <path d="M7 10v10H4V10h3zm3 10h7.6a2 2 0 0 0 2-1.7l1.1-6a2 2 0 0 0-2-2.3H15V6.5A2.5 2.5 0 0 0 12.5 4L10 10v10z" />
      </svg>
      {typeof count === "number" && (
        <span className="sd-like-count font-mono">{count + delta}</span>
      )}
    </button>
  );
}

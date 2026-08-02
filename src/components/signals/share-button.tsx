"use client";

import { useEffect, useState } from "react";

interface Props {
  /** Absolute URL — pass a buildShareUrl result, never a bare path. */
  url: string;
  title: string;
  text?: string;
  className?: string;
}

type State = "idle" | "copied" | "failed";

/**
 * The native sheet where it exists, the clipboard everywhere else. No
 * per-network buttons and no share SDKs: those are third-party script tags on a
 * page whose whole pitch is that it carries none.
 */
export function ShareButton({ url, title, text, className = "" }: Props) {
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const id = setTimeout(() => setState("idle"), 2200);
    return () => clearTimeout(id);
  }, [state]);

  const share = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title, text });
        return;
      } catch {
        // Dismissing the sheet rejects too, so falling through to the clipboard
        // is kinder than reporting a failure the reader caused on purpose.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className={`sd-share ${className}`}
      aria-label={`Share: ${title}`}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M8 7l4-4 4 4" />
      </svg>
      <span className="font-mono sd-share-label" aria-live="polite">
        {state === "copied" ? "Link copied" : state === "failed" ? "Copy failed" : "Share"}
      </span>
    </button>
  );
}

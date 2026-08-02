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
 * Async Clipboard first, `execCommand` second.
 *
 * The legacy path is not belt-and-braces: `navigator.clipboard` is undefined
 * outside a secure context, and the dev server viewed from a phone over
 * http://192.168.x.x is exactly that — the case where someone is most likely to
 * be testing share on a real handset.
 */
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    // Off-screen rather than hidden: display:none cannot hold a selection, and
    // a visible jump would scroll the page under the reader.
    field.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
};

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
    setState((await copyToClipboard(url)) ? "copied" : "failed");
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

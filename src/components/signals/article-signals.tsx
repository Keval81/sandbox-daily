"use client";

import { useEffect, useState } from "react";
import { LikeButton } from "./like-button";
import { ShareButton } from "./share-button";
import { buildShareUrl } from "@/lib/signals/share";
import { getDeviceId } from "@/lib/signals/device";
import type { SignalCounts } from "@/lib/signals/counts";
import type { Vertical } from "@/lib/types";

interface Props {
  slug: string;
  title: string;
  vertical: Vertical;
  /** The top row records the view; the bottom row must not record it again. */
  placement: "top" | "bottom";
}

export function ArticleSignals({ slug, title, vertical, placement }: Props) {
  const [counts, setCounts] = useState<SignalCounts | null>(null);
  const [url, setUrl] = useState("");

  // After mount, never during render: these pages are statically rendered and
  // must stay that way, and the first client render has to match the server
  // HTML — the pattern folio-row.tsx and pulse-client.tsx already use, and the
  // one whose absence cost the whole SSR tree earlier today.
  useEffect(() => {
    // Deferred, not synchronous — the house pattern (folio-row, theme-toggle,
    // pulse-client) and what react-hooks/set-state-in-effect asks for.
    const timer = setTimeout(
      () => setUrl(buildShareUrl(window.location.origin, `/${vertical}/${slug}`)),
      0
    );

    let cancelled = false;
    fetch(`/api/signals?slugs=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; counts?: Record<string, SignalCounts> } | null) => {
        // `ok: false` means the backend could not be read. Showing a confident
        // 0 there would be a number the site cannot stand behind, so show none.
        if (cancelled || !data?.ok) return;
        setCounts(data.counts?.[slug] ?? { likes: 0, views: 0 });
      })
      .catch(() => undefined);

    if (placement === "top") {
      void fetch("/api/views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, deviceId: getDeviceId() }),
        keepalive: true,
      }).catch(() => undefined);
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, vertical, placement]);

  return (
    <div className="sd-signals">
      <LikeButton slug={slug} count={counts?.likes} />
      {counts && (
        <span className="font-mono sd-signals-views">
          {counts.views.toLocaleString("en-GB")} {counts.views === 1 ? "view" : "views"}
        </span>
      )}
      {url && <ShareButton url={url} title={title} />}
    </div>
  );
}

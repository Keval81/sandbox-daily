"use client";

import type { CategoryMeta, LayerEvent } from "@/lib/pulse/types";
import { severityLabel, timeAgo } from "./format";

interface DetailPanelProps {
  event: LayerEvent;
  meta: CategoryMeta;
  now: number;
  onClose: () => void;
}

export function DetailPanel({ event, meta, now, onClose }: DetailPanelProps) {
  const pct = Math.round(Math.max(0, Math.min(1, event.severity)) * 100);

  return (
    <aside
      className="pulse-detail"
      aria-label="Selected event"
      style={{ borderColor: `${meta.color}66` }}
    >
      <div className="pulse-detail-top">
        <span className="pulse-detail-cat" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <button type="button" className="pulse-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <h2 className="pulse-detail-title">{event.title}</h2>

      <dl className="pulse-mini-grid">
        <div className="pulse-mini">
          <dt className="pulse-label">Severity</dt>
          <dd className="pulse-mini-v">{severityLabel(event.severity)}</dd>
        </div>
        <div className="pulse-mini">
          <dt className="pulse-label">Magnitude</dt>
          <dd className="pulse-mini-v font-mono">{event.magnitude ?? "—"}</dd>
        </div>
        <div className="pulse-mini">
          <dt className="pulse-label">Observed</dt>
          <dd className="pulse-mini-v">{timeAgo(event.date, now)}</dd>
        </div>
        <div className="pulse-mini">
          <dt className="pulse-label">Source</dt>
          <dd className="pulse-mini-v">{event.source}</dd>
        </div>
      </dl>

      {/* The severity number is already stated as a word above — this is decoration. */}
      <div className="pulse-meter" aria-hidden="true">
        <span style={{ width: `${pct}%`, background: meta.color }} />
      </div>

      <div className="pulse-detail-foot">
        <span className="pulse-coords font-mono">
          {event.lat.toFixed(2)}°, {event.lon.toFixed(2)}°
        </span>
        {event.url && (
          <a
            className="pulse-link"
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {event.source} report ↗
          </a>
        )}
      </div>
    </aside>
  );
}

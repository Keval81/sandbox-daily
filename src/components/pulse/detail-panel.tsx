"use client";

import type { CategoryMeta, LayerEvent } from "@/lib/pulse/types";
import { describeLocation } from "@/lib/pulse/region";
import { severityLabel, timeAgo } from "./format";

/** Focus target when a selection arrives from the console — see PulseClient. */
export const DETAIL_TITLE_ID = "pulse-detail-title";

interface DetailPanelProps {
  event: LayerEvent;
  meta: CategoryMeta;
  now: number;
  onClose: () => void;
}

export function DetailPanel({ event, meta, now, onClose }: DetailPanelProps) {
  const pct = Math.round(Math.max(0, Math.min(1, event.severity)) * 100);
  // Every EONET event carries its category's constant weight, so all 41
  // wildfires score exactly 1.0 and would read "Severity: Extreme" — directly
  // above "Magnitude: 500 acres". A constant is not a reading, and the panel
  // says so rather than asserting a word it cannot support.
  //
  // Positive test, deliberately: severityFrom is optional, so `!== "category"`
  // would treat an unset field as a measurement and let a future layer that
  // forgot to declare provenance silently re-assert "Extreme" over a constant —
  // the exact defect this exists to prevent. Undeclared reads as unmeasured.
  const measured = event.severityFrom === "magnitude";

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

      <h2 id={DETAIL_TITLE_ID} tabIndex={-1} className="pulse-detail-title">
        {event.title}
      </h2>

      {/* Where on Earth, in words. Several sources title an event without ever
          naming a place ("Active fire front"), so the coordinates in the foot
          were the only answer — and a reader should not have to parse
          decimal degrees to know which continent they clicked. */}
      <p className="pulse-detail-where">{describeLocation(event.lat, event.lon)}</p>

      <dl className="pulse-mini-grid">
        <div className="pulse-mini">
          <dt className="pulse-label">Severity</dt>
          <dd className="pulse-mini-v">
            {measured ? (
              severityLabel(event.severity)
            ) : (
              <>
                — <small className="pulse-mini-note">category baseline</small>
              </>
            )}
          </dd>
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

      {/* The severity number is already stated as a word above — this is
          decoration, and it only decorates a real reading. Over a category
          baseline it would draw a full bar and assert the same thing the words
          above just declined to. */}
      {measured && (
        <div className="pulse-meter" aria-hidden="true">
          <span style={{ width: `${pct}%`, background: meta.color }} />
        </div>
      )}

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

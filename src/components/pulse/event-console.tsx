"use client";

import type { CategoryMeta, LayerEvent } from "@/lib/pulse/types";
import { timeAgo } from "./format";

export type SortMode = "recent" | "severity";

interface EventConsoleProps {
  id: string;
  events: LayerEvent[];
  /** Category metadata is resolved per event, because a category key only means
   *  something inside the layer that declared it. */
  metaOf: (event: LayerEvent) => CategoryMeta | undefined;
  selectedId: string | null;
  now: number;
  query: string;
  onQuery: (value: string) => void;
  sort: SortMode;
  onSort: () => void;
  onSelect: (id: string) => void;
  /** Mobile only: the console covers the globe, so it is a disclosure there. */
  open: boolean;
  footer: string;
  /** "No events match your filters" is a lie when the feed itself is empty. */
  emptyLabel: string;
}

export function EventConsole({
  id, events, metaOf, selectedId, now, query, onQuery, sort, onSort,
  onSelect, open, footer, emptyLabel,
}: EventConsoleProps) {
  return (
    <aside id={id} className={`pulse-console${open ? " open" : ""}`} aria-label="Event console">
      <div className="pulse-panel pulse-console-in">
        <div className="pulse-console-head">
          <input
            type="search"
            className="pulse-search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search events…"
            aria-label="Search events"
          />
          <button type="button" className="pulse-btn" onClick={onSort}>
            Sort: {sort === "recent" ? "Recent" : "Severity"}
          </button>
        </div>

        {/* list-style: none strips list semantics in Safari/VoiceOver, so the
            role is restated rather than assumed. */}
        <ul className="pulse-list" role="list">
          {events.map((e) => {
            const meta = metaOf(e);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  data-pulse-event={e.id}
                  onClick={() => onSelect(e.id)}
                  aria-current={e.id === selectedId}
                  className="pulse-ev"
                >
                  <span className="pulse-ev-dot" style={{ background: meta?.color }} />
                  <span className="pulse-ev-title">{e.title}</span>
                  <span className="pulse-ev-meta">
                    {meta?.label} · {timeAgo(e.date, now)}
                  </span>
                </button>
              </li>
            );
          })}
          {events.length === 0 && <li className="pulse-list-empty">{emptyLabel}</li>}
        </ul>

        <p className="pulse-console-foot" aria-live="polite">
          {footer}
        </p>
      </div>
    </aside>
  );
}

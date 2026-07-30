"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PulseGlobe } from "./pulse-globe";
import { HazardIndex } from "./hazard-index";
import { LayerPanel } from "./layer-panel";
import { EventConsole, type SortMode } from "./event-console";
import { DetailPanel } from "./detail-panel";
import { formatStamp } from "./format";
import type { CategoryMeta, LayerEvent, Marker, PulseSnapshot } from "@/lib/pulse/types";

/** 6-digit hex, deliberately: the engine appends an alpha pair to marker colours. */
const FALLBACK_COLOR = "#98989D";

const CONSOLE_ID = "pulse-console";

interface PulseClientProps {
  snapshot: PulseSnapshot;
}

export function PulseClient({ snapshot }: PulseClientProps) {
  const [active, setActive] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spin, setSpin] = useState(true);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  // Relative times are measured from the snapshot's own timestamp first, so the
  // server HTML and the first client render agree; a mount effect then switches
  // to the wall clock and keeps it ticking.
  const [now, setNow] = useState(() => Date.parse(snapshot.generatedAt));

  useEffect(() => {
    // Deferred rather than synchronous: the first client render has to match the
    // server HTML, and only then does the wall clock take over.
    const sync = () => setNow(Date.now());
    const first = setTimeout(sync, 0);
    const id = setInterval(sync, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const categories = useMemo(() => {
    const all: Record<string, CategoryMeta> = {};
    for (const layer of snapshot.layers) Object.assign(all, layer.categories);
    return all;
  }, [snapshot.layers]);

  const byId = useMemo(
    () => new Map<string, LayerEvent>(snapshot.events.map((e) => [e.id, e])),
    [snapshot.events]
  );

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const e of snapshot.events) tally[e.category] = (tally[e.category] ?? 0) + 1;
    return tally;
  }, [snapshot.events]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = snapshot.events.filter(
      (e) =>
        (active.size === 0 || active.has(e.category)) &&
        (q === "" || e.title.toLowerCase().includes(q))
    );
    return list.sort(
      sort === "recent"
        ? (a, b) => Date.parse(b.date) - Date.parse(a.date)
        : (a, b) => b.severity - a.severity
    );
  }, [snapshot.events, active, query, sort]);

  const markers: Marker[] = useMemo(
    () =>
      visible.map((e) => ({
        id: e.id,
        lat: e.lat,
        lon: e.lon,
        color: categories[e.category]?.color ?? FALLBACK_COLOR,
        weight: e.severity,
      })),
    [visible, categories]
  );

  const selected = (selectedId && byId.get(selectedId)) || null;

  // PulseGlobe compares focusOn by identity — a fresh object each render would
  // restart the focus animation on every keystroke in the search box.
  const focusOn = useMemo(
    () => (selected ? { lat: selected.lat, lon: selected.lon } : null),
    [selected]
  );

  const freshness = snapshot.stale
    ? { label: "Snapshot", live: false }
    : { label: "Live", live: true };

  const deadSources = useMemo(
    () => snapshot.layers.filter((l) => !l.live).map((l) => l.label),
    [snapshot.layers]
  );

  const sources = useMemo(
    () => Array.from(new Set(snapshot.events.map((e) => e.source))),
    [snapshot.events]
  );

  const hazard = snapshot.layers.find((l) => l.index !== null)?.index ?? null;
  const wildfires = counts.wildfire ?? 0;

  const handlePick = useCallback((id: string | null) => setSelectedId(id), []);

  const handleHover = useCallback((id: string | null, x: number, y: number) => {
    // The engine emits on every pointermove, repeated nulls included. Returning
    // the previous object bails the re-render out rather than storming React.
    setHover((prev) => {
      if (id === null) return prev === null ? prev : null;
      if (prev && prev.id === id && prev.x === x && prev.y === y) return prev;
      return { id, x, y };
    });
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setConsoleOpen(false);
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const resetCategories = useCallback(() => setActive(new Set()), []);
  const toggleSort = useCallback(
    () => setSort((s) => (s === "recent" ? "severity" : "recent")),
    []
  );

  const hovered = hover ? byId.get(hover.id) : undefined;
  const stamp = formatStamp(snapshot.generatedAt);

  return (
    <div className="pulse-stage">
      <div className="pulse-globe">
        <PulseGlobe
          markers={markers}
          selectedId={selectedId}
          spin={spin}
          focusOn={focusOn}
          onPick={handlePick}
          onHover={handleHover}
        />
        {hover && hovered && (
          <div className="pulse-tip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
            <span
              className="pulse-tip-dot"
              style={{ background: categories[hovered.category]?.color ?? FALLBACK_COLOR }}
            />
            <span className="pulse-tip-name">{hovered.title}</span>
          </div>
        )}
      </div>

      <div className="pulse-hud" data-console-open={consoleOpen ? "true" : "false"}>
        <section className="pulse-panel pulse-callsign" aria-label="Feed status">
          <p className="pulse-status" data-stale={freshness.live ? "false" : "true"}>
            <span className="pulse-pip" data-stale={freshness.live ? "false" : "true"} />
            <span className="pulse-status-label">{freshness.label}</span>
            <time className="pulse-status-time font-mono" dateTime={snapshot.generatedAt}>
              {stamp}
            </time>
          </p>

          <h1 className="pulse-wordmark">
            Planet<span>·</span>Pulse
          </h1>
          <p className="pulse-sub">
            Wildfires, earthquakes and storms open worldwide right now.
          </p>

          {hazard && (
            <HazardIndex
              index={hazard}
              eventCount={snapshot.events.length}
              wildfires={wildfires}
            />
          )}

          <p className="pulse-tally">
            <span className="font-mono">{snapshot.events.length}</span> events
            {snapshot.unplottable > 0 && (
              <>
                {" · "}
                <span className="font-mono">{snapshot.unplottable}</span> unplottable
              </>
            )}
          </p>

          {sources.length > 0 && (
            <p className="pulse-sources">
              <span className="pulse-label">Sources</span> {sources.join(" · ")}
            </p>
          )}

          {/* With no events at all the empty state below names the same gap. */}
          {deadSources.length > 0 && snapshot.events.length > 0 && (
            <p className="pulse-dead">{deadSources.join(" and ")} unavailable</p>
          )}

          {snapshot.events.length === 0 && (
            <p className="pulse-empty">
              No open hazards reported in the last seven days.
              {deadSources.length > 0 && ` ${deadSources.join(" and ")} unavailable.`}
            </p>
          )}
        </section>

        <LayerPanel
          layers={snapshot.layers}
          counts={counts}
          active={active}
          onToggle={toggleCategory}
          onReset={resetCategories}
        />
      </div>

      <div className="pulse-controls">
        <button
          type="button"
          className="pulse-btn"
          aria-pressed={spin}
          aria-label={spin ? "Pause rotation" : "Resume rotation"}
          onClick={() => setSpin((s) => !s)}
        >
          {spin ? "Pause" : "Rotate"}
        </button>
        <button
          type="button"
          className="pulse-btn pulse-btn-events"
          aria-expanded={consoleOpen}
          aria-controls={CONSOLE_ID}
          onClick={() => setConsoleOpen((o) => !o)}
        >
          {consoleOpen ? "Close" : "Events"} <span className="font-mono">{visible.length}</span>
        </button>
      </div>

      <EventConsole
        id={CONSOLE_ID}
        events={visible}
        categories={categories}
        selectedId={selectedId}
        now={now}
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={toggleSort}
        onSelect={handleSelect}
        open={consoleOpen}
        footer={`${visible.length} of ${snapshot.events.length} shown · ${freshness.label.toLowerCase()} ${stamp}`}
        emptyLabel={
          snapshot.events.length === 0
            ? "No hazards in this snapshot."
            : "No events match your filters."
        }
      />

      {selected && (
        <DetailPanel
          event={selected}
          meta={categories[selected.category] ?? {
            label: "Other",
            color: FALLBACK_COLOR,
            weight: 0.6,
          }}
          now={now}
          onClose={() => setSelectedId(null)}
        />
      )}

      <p className="pulse-hint">Drag to rotate · scroll to zoom · click a marker</p>
    </div>
  );
}

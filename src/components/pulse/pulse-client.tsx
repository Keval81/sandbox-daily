"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PulseGlobe } from "./pulse-globe";
import { HazardIndex } from "./hazard-index";
import { LayerPanel } from "./layer-panel";
import { EventConsole, type SortMode } from "./event-console";
import { DetailPanel, DETAIL_TITLE_ID } from "./detail-panel";
import { formatStamp } from "./format";
import type { CategoryMeta, LayerEvent, Marker, PulseSnapshot } from "@/lib/pulse/types";

/** 6-digit hex, deliberately: the engine appends an alpha pair to marker colours. */
const FALLBACK_COLOR = "#98989D";

const CONSOLE_ID = "pulse-console";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

const subscribeMotion = (onChange: () => void): (() => void) => {
  const mq = matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const getMotion = (): boolean => matchMedia(REDUCED_MOTION).matches;
/** The server cannot know the reader's motion preference; the store corrects it
 *  on hydration, which is exactly what useSyncExternalStore is for. */
const getServerMotion = (): boolean => false;

/** One predicate for the visible list and for "did that filter just hide the
 *  selected event?" — two copies would drift. */
const matchesFilters = (e: LayerEvent, active: Set<string>, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return (
    (active.size === 0 || active.has(e.category)) &&
    (q === "" || e.title.toLowerCase().includes(q))
  );
};

interface PulseClientProps {
  snapshot: PulseSnapshot;
}

export function PulseClient({ snapshot }: PulseClientProps) {
  const [active, setActive] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spinRequested, setSpinRequested] = useState(true);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  // Set when a selection came from the console, so focus follows the user into
  // the detail panel; a globe pick leaves focus on the canvas.
  const focusDetailRef = useRef(false);

  const reducedMotion = useSyncExternalStore(subscribeMotion, getMotion, getServerMotion);
  // The engine refuses to spin under reduced motion (engine.ts setSpin), so the
  // button has to read the same truth or it labels a stationary globe "Pause".
  const spinning = spinRequested && !reducedMotion;

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
    const list = snapshot.events.filter((e) => matchesFilters(e, active, query));
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

  const deadSources = useMemo(
    () => snapshot.layers.filter((l) => !l.live).map((l) => l.label),
    [snapshot.layers]
  );

  const allSourcesDead =
    snapshot.layers.length > 0 && deadSources.length === snapshot.layers.length;

  // A snapshot assembled a second ago out of nothing is not "Live". Without this
  // term, a total outage with no warm cache renders a blinking green pip over an
  // empty planet — the exact failure this feature was rebuilt to prevent.
  const freshness =
    snapshot.stale || allSourcesDead
      ? { label: "Snapshot", live: false }
      : { label: "Live", live: true };

  const sources = useMemo(
    () => Array.from(new Set(snapshot.events.map((e) => e.source))),
    [snapshot.events]
  );

  // Only a live layer may publish an index: hazardIndex scores an empty list 0,
  // which bands as a green "Calm" — a fabricated reading over a dead feed.
  const hazard = snapshot.layers.find((l) => l.live && l.index !== null)?.index ?? null;
  const wildfires = counts.wildfire ?? 0;

  const handlePick = useCallback((id: string | null) => {
    focusDetailRef.current = false;
    setSelectedId(id);
  }, []);

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
    focusDetailRef.current = true;
    setSelectedId(id);
    setConsoleOpen(false);
  }, []);

  // On selection from the console, focus follows into the panel. On mobile that
  // is not a nicety: closing the console display:none's the very button the user
  // just pressed, which would drop focus to <body> with no announcement.
  useEffect(() => {
    if (!selectedId || !focusDetailRef.current) return;
    focusDetailRef.current = false;
    document.getElementById(DETAIL_TITLE_ID)?.focus();
  }, [selectedId]);

  /** Dismissing must hand focus back, not drop it on <body>. */
  const dismiss = useCallback(() => {
    if (!selectedId) return;
    const row = document.querySelector<HTMLElement>(
      `[data-pulse-event="${CSS.escape(selectedId)}"]`
    );
    setSelectedId(null);
    // offsetParent is null for anything the mobile breakpoint has hidden, and a
    // hidden element silently refuses focus — fall back to the globe itself.
    const target =
      row && row.offsetParent !== null
        ? row
        : document.querySelector<HTMLElement>(".pulse-canvas");
    target?.focus();
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape natively clears a search field; do not steal it from the input.
      if (e.target instanceof HTMLInputElement) return;
      dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, dismiss]);

  const toggleCategory = useCallback(
    (category: string) => {
      const next = new Set(active);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      setActive(next);
      // Otherwise the detail panel stays open over a marker that is no longer drawn.
      if (selected && !matchesFilters(selected, next, query)) setSelectedId(null);
    },
    [active, query, selected]
  );

  const resetCategories = useCallback(() => setActive(new Set()), []);

  const handleQuery = useCallback(
    (value: string) => {
      setQuery(value);
      if (selected && !matchesFilters(selected, active, value)) setSelectedId(null);
    },
    [active, selected]
  );

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
          spin={spinning}
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
          aria-pressed={spinning}
          disabled={reducedMotion}
          aria-label={
            reducedMotion
              ? "Rotation is off because your system asks for reduced motion"
              : spinning
                ? "Pause rotation"
                : "Resume rotation"
          }
          onClick={() => setSpinRequested((s) => !s)}
        >
          {spinning ? "Pause" : "Rotate"}
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
        onQuery={handleQuery}
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
          onClose={dismiss}
        />
      )}

      <p className="pulse-hint">Drag to rotate · scroll to zoom · click a marker</p>
    </div>
  );
}

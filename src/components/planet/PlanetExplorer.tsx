"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe } from "./Globe";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/planet/categories";
import { disasterScore } from "@/lib/planet/score";
import { timeAgo, severityLabel } from "@/lib/planet/format";
import type {
  HazardCategory,
  HazardEvent,
  HazardFeed,
} from "@/lib/planet/types";

type SortMode = "recent" | "severity";
type HoverState = { ev: HazardEvent; x: number; y: number } | null;

const REFRESH_MS = 5 * 60 * 1000;

export function PlanetExplorer() {
  const [feed, setFeed] = useState<HazardFeed | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [active, setActive] = useState<Set<HazardCategory>>(new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [focus, setFocus] = useState<{ id: string | null; token: number }>({
    id: null,
    token: 0,
  });
  const [panelOpen, setPanelOpen] = useState(false); // mobile list sheet
  const [now, setNow] = useState(() => Date.now());

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/planet/events", { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HazardFeed = await res.json();
      setFeed(data);
      setStatus("ready");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setStatus((s) => (s === "ready" ? "ready" : "error"));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      clearInterval(t);
      abortRef.current?.abort();
    };
  }, [load]);

  // Tick "time ago" labels once a minute.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const allEvents = useMemo(() => feed?.events ?? [], [feed]);

  // Categories actually present, in canonical order.
  const presentCats = useMemo(() => {
    const set = new Set(allEvents.map((e) => e.category));
    return CATEGORY_ORDER.filter((c) => set.has(c));
  }, [allEvents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = allEvents.filter((e) => {
      if (active.size && !active.has(e.category)) return false;
      if (q && !e.title.toLowerCase().includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) =>
      sort === "recent"
        ? +new Date(b.date) - +new Date(a.date)
        : b.severity - a.severity
    );
    return list;
  }, [allEvents, active, query, sort]);

  // The globe plots the filtered set (so filters visibly prune it).
  const globeEvents = filtered;

  const selected = useMemo(
    () => allEvents.find((e) => e.id === selectedId) ?? null,
    [allEvents, selectedId]
  );

  const toggleCat = (c: HazardCategory) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const pickEvent = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setFocus((f) => ({ id, token: f.token + 1 }));
  }, []);

  const onHover = useCallback(
    (ev: HazardEvent | null, x: number, y: number) => {
      setHover(ev ? { ev, x, y } : null);
    },
    []
  );

  const wildfireCount = feed?.counts.wildfire ?? 0;

  // Global Hazard Index — a snapshot over ALL current events, not the filtered
  // subset (it describes the state of the planet, not the current view).
  const index = useMemo(
    () => (allEvents.length ? disasterScore(allEvents) : null),
    [allEvents]
  );

  return (
    <div className="relative h-[calc(100dvh-64px)] w-full overflow-hidden bg-[#05070e] text-cream">
      {/* Radial vignette + subtle grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 30%, rgba(30,60,120,0.20), rgba(5,7,14,0) 60%), radial-gradient(80% 60% at 50% 120%, rgba(231,93,49,0.10), rgba(5,7,14,0) 70%)",
        }}
      />

      {/* Globe canvas */}
      <div className="absolute inset-0">
        <Globe
          events={globeEvents}
          selectedId={selectedId}
          focusId={focus.id}
          focusToken={focus.token}
          onSelect={pickEvent}
          onHover={onHover}
          autoRotate={autoRotate}
        />
      </div>

      {/* ===== Top-left: title + status ===== */}
      <div
        className={`pointer-events-none absolute left-4 top-4 z-20 max-w-[min(92vw,360px)] sm:left-6 sm:top-6 ${
          panelOpen ? "hidden lg:block" : ""
        }`}
      >
        <div className="pointer-events-auto rounded-sharp border border-white/10 bg-black/40 p-3 backdrop-blur-md sm:p-4">
          <div className="flex items-center gap-2">
            <LivePip degraded={feed?.degraded} status={status} />
            <span className="font-mono text-[10px] uppercase tracking-mono-wide text-accent">
              {feed?.degraded
                ? "Sample feed"
                : status === "ready"
                  ? "Live feed"
                  : status === "error"
                    ? "Offline"
                    : "Connecting"}
            </span>
          </div>
          <h1 className="mt-1.5 font-display text-2xl font-black leading-none tracking-tight text-cream sm:mt-2 sm:text-3xl">
            Planet Pulse
          </h1>
          <p className="mt-1 hidden font-mono text-[10px] leading-relaxed tracking-mono text-grey sm:block">
            Live wildfires &amp; natural hazards, worldwide.
          </p>

          <div className="mt-4 flex items-center gap-3.5">
            <HazardGauge
              score={index?.score ?? 0}
              color={index?.color ?? "#43e0a0"}
            />
            <div className="min-w-0">
              <div className="font-mono text-meta-sm uppercase tracking-mono-wide text-grey">
                Global Hazard Index
              </div>
              <div
                className="font-mono text-[15px] font-bold uppercase leading-tight tracking-mono"
                style={{ color: index?.color ?? "#F5EED8" }}
              >
                {index?.band ?? "—"}
              </div>
              <div className="mt-0.5 font-mono text-meta-sm tracking-mono text-grey">
                {feed ? `${allEvents.length} events · ${wildfireCount} wildfires` : "—"}
              </div>
            </div>
          </div>

          <div className="mt-3 hidden grid-cols-3 gap-2 sm:grid">
            <Stat label="Events" value={feed ? allEvents.length : "—"} />
            <Stat label="Wildfires" value={feed ? wildfireCount : "—"} accent="#ff5a1f" />
            <Stat
              label="Shown"
              value={feed ? globeEvents.length : "—"}
              accent="#56A077"
            />
          </div>

          <div className="mt-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-mono text-grey">
            <span>
              {feed?.sources?.length
                ? feed.sources.join(" · ")
                : "NASA EONET · USGS"}
            </span>
            {feed && (
              <span title={new Date(feed.updatedAt).toLocaleString()}>
                {timeAgo(feed.updatedAt, now)}
              </span>
            )}
          </div>
        </div>

        {/* Legend / category filters */}
        <div className="pointer-events-auto mt-3 hidden rounded-sharp border border-white/10 bg-black/40 p-3 backdrop-blur-md sm:block">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-mono-wide text-grey">
              Filter by hazard
            </span>
            {active.size > 0 && (
              <button
                onClick={() => setActive(new Set())}
                className="cursor-pointer font-mono text-[9px] uppercase tracking-mono text-accent hover:text-cream"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presentCats.map((c) => {
              const meta = CATEGORIES[c];
              const on = active.size === 0 || active.has(c);
              return (
                <button
                  key={c}
                  onClick={() => toggleCat(c)}
                  className="group flex cursor-pointer items-center gap-1.5 rounded-sharp border px-2 py-1 font-mono text-[9px] uppercase tracking-mono transition-colors"
                  style={{
                    borderColor: on ? meta.color + "80" : "rgba(255,255,255,0.08)",
                    background: on ? meta.color + "1f" : "transparent",
                    color: on ? "#F5EED8" : "#6E655B",
                  }}
                  title={`${meta.label} · ${feed?.counts[c] ?? 0}`}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      background: meta.color,
                      opacity: on ? 1 : 0.4,
                      boxShadow: on ? `0 0 6px ${meta.color}` : "none",
                    }}
                  />
                  {meta.label}
                  <span className="text-grey">{feed?.counts[c] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== Top-right: controls ===== */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 sm:right-6 sm:top-6">
        <IconToggle
          on={autoRotate}
          onClick={() => setAutoRotate((v) => !v)}
          label={autoRotate ? "Pause spin" : "Auto-spin"}
        >
          {autoRotate ? "❙❙" : "▸"}
        </IconToggle>
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="pointer-events-auto flex h-9 items-center gap-2 rounded-sharp border border-white/10 bg-black/40 px-3 font-mono text-[10px] uppercase tracking-mono text-cream backdrop-blur-md hover:border-white/25 lg:hidden"
        >
          {panelOpen ? "Close" : "Events"}
          <span className="text-accent">{globeEvents.length}</span>
        </button>
      </div>

      {/* ===== Right: event list ===== */}
      <div
        className={`absolute bottom-0 right-0 top-0 z-20 flex w-full flex-col sm:w-[340px] lg:w-[360px] ${
          panelOpen ? "flex" : "hidden lg:flex"
        }`}
      >
        <div className="mt-16 flex min-h-0 flex-1 flex-col border-l border-white/10 bg-black/45 backdrop-blur-md sm:mt-6 sm:mb-6 sm:mr-6 sm:rounded-sharp sm:border">
          <div className="border-b border-white/10 p-3">
            <div className="flex items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events…"
                className="min-w-0 flex-1 rounded-sharp border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[11px] text-cream placeholder:text-grey focus:border-accent/60 focus:outline-none"
              />
              <button
                onClick={() =>
                  setSort((s) => (s === "recent" ? "severity" : "recent"))
                }
                className="cursor-pointer whitespace-nowrap rounded-sharp border border-white/10 px-2 py-1.5 font-mono text-[9px] uppercase tracking-mono text-grey hover:text-cream"
                title="Toggle sort"
              >
                {sort === "recent" ? "↧ Recent" : "▲ Severity"}
              </button>
            </div>
          </div>

          <ul className="min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto">
            {status === "loading" && (
              <li className="p-4 font-mono text-[11px] text-grey">
                Loading live feed…
              </li>
            )}
            {status !== "loading" && filtered.length === 0 && (
              <li className="p-4 font-mono text-[11px] text-grey">
                No events match your filters.
              </li>
            )}
            {filtered.map((e) => {
              const meta = CATEGORIES[e.category];
              const isSel = e.id === selectedId;
              return (
                <li key={e.id}>
                  <button
                    onClick={() => pickEvent(e.id)}
                    className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                      isSel ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <span
                      className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background: meta.color,
                        boxShadow: `0 0 8px ${meta.color}`,
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body text-[13px] leading-snug text-cream">
                        {e.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-mono text-grey">
                        <span style={{ color: meta.color }}>{meta.label}</span>
                        <span>·</span>
                        <span>{timeAgo(e.date, now)}</span>
                        {e.magnitude && (
                          <>
                            <span>·</span>
                            <span>{e.magnitude}</span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-white/10 px-3 py-2 font-mono text-[9px] uppercase tracking-mono text-grey">
            {filtered.length} shown · updates every 15 min
          </div>
        </div>
      </div>

      {/* ===== Detail card ===== */}
      {selected && (
        <DetailCard
          event={selected}
          now={now}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* ===== Hover tooltip ===== */}
      {hover && !selected && (
        <div
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap rounded-sharp border border-white/15 bg-black/80 px-2.5 py-1.5 backdrop-blur-md"
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: CATEGORIES[hover.ev.category].color,
                boxShadow: `0 0 6px ${CATEGORIES[hover.ev.category].color}`,
              }}
            />
            <span className="font-body text-[12px] text-cream">
              {hover.ev.title}
            </span>
          </div>
        </div>
      )}

      {/* ===== Bottom-left hint ===== */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden font-mono text-[9px] uppercase tracking-mono text-grey sm:left-6 sm:block">
        Drag to rotate · scroll to zoom · click a marker
      </div>
    </div>
  );
}

// ---- small presentational bits ------------------------------------------

function LivePip({
  degraded,
  status,
}: {
  degraded?: boolean;
  status: string;
}) {
  const color =
    status === "error" ? "#ff2d55" : degraded ? "#c99a2e" : "#56A077";
  return (
    <span className="relative flex h-2 w-2">
      {status !== "error" && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ background: color }}
        />
      )}
      <span
        className="relative inline-flex h-2 w-2 rounded-full"
        style={{ background: color }}
      />
    </span>
  );
}

function HazardGauge({ score, color }: { score: number; color: string }) {
  return (
    <div
      className="relative h-[70px] w-[70px] shrink-0 rounded-full transition-shadow duration-500"
      style={{
        background: `conic-gradient(${color} ${score}%, rgba(255,255,255,0.08) 0)`,
        boxShadow: `0 0 16px -6px ${color}`,
      }}
      role="meter"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Global hazard index"
    >
      <div className="absolute inset-[5px] rounded-full bg-[#0b1120]" />
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <div className="font-mono text-xl font-bold tabular-nums text-cream">
            {score}
          </div>
          <div className="mt-0.5 font-mono text-[7px] tracking-mono text-grey">
            / 100
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = "#F5EED8",
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="rounded-sharp border border-white/8 bg-white/[0.03] px-2 py-1.5">
      <div
        className="font-display text-lg font-black leading-none"
        style={{ color: accent }}
      >
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[8px] uppercase tracking-mono text-grey">
        {label}
      </div>
    </div>
  );
}

function IconToggle({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-sharp border border-white/10 bg-black/40 font-mono text-[11px] text-cream backdrop-blur-md transition-colors hover:border-white/25"
      style={{ color: on ? "#56A077" : "#F5EED8" }}
    >
      {children}
    </button>
  );
}

function DetailCard({
  event,
  now,
  onClose,
}: {
  event: HazardEvent;
  now: number;
  onClose: () => void;
}) {
  const meta = CATEGORIES[event.category];
  return (
    <div className="absolute bottom-4 left-4 z-30 w-[min(92vw,340px)] sm:bottom-6 sm:left-6">
      <div
        className="rounded-sharp border bg-black/70 p-4 backdrop-blur-xl"
        style={{ borderColor: meta.color + "66" }}
      >
        <div className="flex items-start justify-between gap-3">
          <span
            className="font-mono text-[9px] uppercase tracking-mono-wide"
            style={{ color: meta.color }}
          >
            {meta.glyph} {meta.label}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 cursor-pointer font-mono text-sm text-grey hover:text-cream"
          >
            ✕
          </button>
        </div>
        <h2 className="mt-2 font-display text-lg font-black leading-tight text-cream">
          {event.title}
        </h2>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <MiniStat label="Severity" value={severityLabel(event.severity)} />
          <MiniStat label="Magnitude" value={event.magnitude ?? "—"} />
          <MiniStat label="Observed" value={timeAgo(event.date, now)} />
          <MiniStat label="Source" value={event.source} />
        </div>

        {/* Severity meter */}
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(event.severity * 100)}%`,
                background: meta.color,
                boxShadow: `0 0 8px ${meta.color}`,
              }}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-mono text-grey">
          <span>
            {event.lat.toFixed(2)}°, {event.lon.toFixed(2)}°
          </span>
          {event.link && (
            <a
              href={event.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-cream"
            >
              Details ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sharp border border-white/8 bg-white/[0.03] px-2 py-1.5">
      <div className="font-mono text-[8px] uppercase tracking-mono text-grey">
        {label}
      </div>
      <div className="mt-0.5 font-body text-[13px] text-cream">{value}</div>
    </div>
  );
}

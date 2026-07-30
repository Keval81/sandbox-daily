"use client";

import { useEffect, useRef } from "react";
import { GlobeEngine } from "@/lib/pulse/globe-engine";
import type { Marker } from "@/lib/pulse/types";

interface PulseGlobeProps {
  markers: Marker[];
  selectedId?: string | null;
  compact?: boolean;
  spin?: boolean;
  focusOn?: { lat: number; lon: number } | null;
  onPick?: (id: string | null) => void;
  onHover?: (id: string | null, x: number, y: number) => void;
}

export function PulseGlobe({
  markers, selectedId = null, compact = false, spin = true,
  focusOn = null, onPick, onHover,
}: PulseGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GlobeEngine | null>(null);

  // Callbacks live in refs so a parent re-render never tears the engine down.
  // Assigned during render (not an effect) so the ref is current before the
  // mount effect's listeners can fire. `react-hooks/refs` flags ref writes
  // during render on principle, but this write is idempotent per commit and
  // read only from async engine event callbacks, never during render itself.
  const onPickRef = useRef(onPick);
  const onHoverRef = useRef(onHover);
  // eslint-disable-next-line react-hooks/refs -- intentional: see comment above
  onPickRef.current = onPick;
  // eslint-disable-next-line react-hooks/refs -- intentional: see comment above
  onHoverRef.current = onHover;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GlobeEngine(canvas, { compact });
    engineRef.current = engine;

    const offPick = engine.on("pick", (id) => onPickRef.current?.(id));
    const offHover = engine.on("hover", (id, x, y) => onHoverRef.current?.(id, x, y));

    const host = canvas.parentElement;
    const observer = new ResizeObserver(() => engine.resize());
    if (host) observer.observe(host);

    return () => {
      observer.disconnect();
      offPick();
      offHover();
      engine.destroy();
      engineRef.current = null;
    };
  }, [compact]);

  useEffect(() => { engineRef.current?.setMarkers(markers); }, [markers]);
  useEffect(() => { engineRef.current?.setSelected(selectedId); }, [selectedId]);
  useEffect(() => { engineRef.current?.setSpin(spin); }, [spin]);
  useEffect(() => {
    if (focusOn) engineRef.current?.focus(focusOn.lat, focusOn.lon);
  }, [focusOn]);

  return (
    <canvas
      ref={canvasRef}
      className="pulse-canvas"
      tabIndex={compact ? -1 : 0}
      aria-label={
        compact
          ? "Rotating globe showing current natural hazards"
          : "Interactive globe of current natural hazards. Use arrow keys to rotate. Every event is also listed in the events panel."
      }
    />
  );
}

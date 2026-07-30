"use client";

import { CATEGORY_ORDER } from "@/lib/pulse/layers/hazards";
import type { PulseLayerSummary } from "@/lib/pulse/types";

interface LayerPanelProps {
  /** Only registered layers reach here — there are no "coming soon" rows. */
  layers: PulseLayerSummary[];
  counts: Record<string, number>;
  active: Set<string>;
  onToggle: (category: string) => void;
  onReset: () => void;
}

export function LayerPanel({ layers, counts, active, onToggle, onReset }: LayerPanelProps) {
  return (
    <section className="pulse-panel pulse-layers" aria-label="Hazard filters">
      <div className="pulse-layers-head">
        <span className="pulse-label">Filter by hazard</span>
        {active.size > 0 && (
          <button type="button" className="pulse-reset" onClick={onReset}>
            Reset
          </button>
        )}
      </div>

      {layers.map((layer) => {
        // A category only belongs to the layer that declares it, so a second
        // layer added later cannot borrow this one's chips.
        const present = CATEGORY_ORDER.filter((c) => layer.categories[c] && counts[c] > 0);
        return (
          <fieldset key={layer.id} className="pulse-group">
            <legend className="pulse-group-label">{layer.label}</legend>
            <div className="pulse-chips">
              {present.length === 0 && (
                <span className="pulse-group-empty">Nothing reported</span>
              )}
              {present.map((c) => {
                const meta = layer.categories[c];
                const on = active.size === 0 || active.has(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggle(c)}
                    className="pulse-chip"
                    style={{ borderColor: on ? `${meta.color}88` : "transparent" }}
                  >
                    <span
                      className="pulse-chip-dot"
                      style={{ background: meta.color, opacity: on ? 1 : 0.4 }}
                    />
                    {meta.label}
                    <span className="font-mono">{counts[c]}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </section>
  );
}

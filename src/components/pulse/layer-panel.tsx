"use client";

import { categoryKey } from "@/lib/pulse/category-key";
import type { PulseLayerSummary } from "@/lib/pulse/types";

interface LayerPanelProps {
  /** Only registered layers reach here — there are no "coming soon" rows. */
  layers: PulseLayerSummary[];
  /** Keyed by categoryKey(layer, category), not by category alone. */
  counts: Record<string, number>;
  active: Set<string>;
  onToggle: (key: string) => void;
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
        // The ordering comes off the layer. A panel that imported one specific
        // layer's ordering would match nothing for every other layer and render
        // it as "Nothing reported" while it had plenty to report.
        const present = layer.categoryOrder.filter(
          (c) => layer.categories[c] && (counts[categoryKey(layer.id, c)] ?? 0) > 0
        );
        return (
          <fieldset key={layer.id} className="pulse-group">
            <legend className="pulse-group-label">{layer.label}</legend>
            <div className="pulse-chips">
              {present.length === 0 && (
                <span className="pulse-group-empty">Nothing reported</span>
              )}
              {present.map((c) => {
                const key = categoryKey(layer.id, c);
                const meta = layer.categories[c];
                const on = active.size === 0 || active.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggle(key)}
                    className="pulse-chip"
                    style={{ borderColor: on ? `${meta.color}88` : "transparent" }}
                  >
                    <span
                      className="pulse-chip-dot"
                      style={{ background: meta.color, opacity: on ? 1 : 0.4 }}
                    />
                    {meta.label}
                    <span className="font-mono">{counts[key]}</span>
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

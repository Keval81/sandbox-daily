"use client";
import { useState } from "react";
import type { RadarEvent } from "@/lib/radar/events";

export function RadarList({ events }: { events: RadarEvent[] }) {
  const [promoted, setPromoted] = useState<Set<string>>(
    new Set(events.filter((e) => e.promoted).map((e) => e.id))
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function promote(id: string) {
    setBusy(id);
    try {
      const res = await fetch("/admin/radar/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: id }),
      });
      if (res.ok) {
        setPromoted((p) => new Set(p).add(id));
      } else {
        console.error("promote failed", res.status, await res.text());
      }
    } catch (err) {
      console.error("promote network error", err);
    } finally {
      setBusy(null);
    }
  }

  if (events.length === 0) return <p>No events surfaced yet.</p>;
  return (
    <ul className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="border rounded-lg p-4 flex flex-col gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase px-2 py-0.5 rounded bg-neutral-100 text-neutral-900">{e.location}</span>
              <span className="text-xs text-neutral-500">vol {e.volume} · score {e.score}</span>
            </div>
            <p className="font-medium mt-1">{e.title}</p>
            <div className="text-xs text-neutral-400 mt-1">
              {e.sources.slice(0, 3).map((s, i) => (
                <a key={s} href={s} target="_blank" rel="noreferrer" className="underline mr-2">source {i + 1}</a>
              ))}
            </div>
          </div>
          <button
            disabled={promoted.has(e.id) || busy === e.id}
            onClick={() => promote(e.id)}
            className="w-full min-h-11 shrink-0 rounded bg-black px-4 text-sm font-medium text-white disabled:opacity-40 sm:w-auto sm:self-start"
          >
            {promoted.has(e.id) ? "Promoted" : busy === e.id ? "…" : "Promote"}
          </button>
        </li>
      ))}
    </ul>
  );
}

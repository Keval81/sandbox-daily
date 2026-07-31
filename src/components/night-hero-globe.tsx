"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { PulseGlobe } from "@/components/pulse/pulse-globe";
import type { Marker } from "@/lib/pulse/types";

const TAP_SLOP_PX = 6;

/** Drag rotates; a true tap (no travel) opens /pulse. A Link wrapper can't
 *  make that distinction — it would navigate at the end of every drag. */
export function NightHeroGlobe({ markers }: { markers: Marker[] }) {
  const router = useRouter();
  const down = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="night-hero-globe"
      onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < TAP_SLOP_PX) {
          router.push("/pulse");
        }
      }}
    >
      <img src="/images/pulse-globe-poster.webp" alt="" className="night-hero-poster" />
      <PulseGlobe markers={markers} ambient spin />
    </div>
  );
}

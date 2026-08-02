import { notFound } from "next/navigation";
import { RadarList } from "./RadarList";
import { operatorSurfaceEnabled } from "@/lib/admin/surface";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Event Radar - Sandbox Daily Admin",
  description: "Ranked breaking-news events.",
};

export default async function RadarPage() {
  if (!operatorSurfaceEnabled()) {
    notFound();
  }
  const { readEvents } = await import("@/lib/radar/events");
  const { generated_at, events } = await readEvents();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-1">Event Radar</h1>
      <p className="text-sm text-neutral-500 mb-6">
        {generated_at ? `Updated ${new Date(generated_at).toLocaleString()}` : "No feed yet"}
      </p>
      <RadarList events={events} />
    </main>
  );
}

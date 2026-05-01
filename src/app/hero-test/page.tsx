const candidates = [
  { hex: "#E75D31", note: "Current site orange (sampled corners)" },
  { hex: "#E25A2E", note: "Slightly darker — compensate for video brightness shift" },
  { hex: "#DE5729", note: "Darker still — deeper rust undertone" },
  { hex: "#EB6134", note: "Slightly brighter — if video renders darker than hex" },
  { hex: "#E55B2F", note: "Median of 8 video samples" },
  { hex: "#D9522A", note: "Much darker — strong rust" },
];

export default function HeroTestPage() {
  return (
    <main className="min-h-screen bg-cream text-ink">
      <header className="mx-auto max-w-[1200px] px-6 py-12">
        <p className="font-mono text-meta uppercase tracking-mono-wide text-grey">
          Preview · Hero orange match
        </p>
        <h1 className="font-display text-4xl font-bold leading-headline mt-3 md:text-5xl">
          Pick the cleanest seam
        </h1>
        <p className="font-body text-body mt-4 max-w-reading text-grey">
          Each panel shows the brain video against a different hex. Look for
          the one where the video&apos;s orange blends most seamlessly into
          the surrounding CSS orange. The label in the corner tells you which
          hex is being used.
        </p>
      </header>

      <section className="flex flex-col gap-12 pb-20">
        {candidates.map((c) => (
          <article
            key={c.hex}
            className="relative"
            style={{ backgroundColor: c.hex }}
          >
            <div className="absolute top-4 left-4 z-10 bg-ink text-cream font-mono text-meta uppercase tracking-mono px-3 py-2 rounded-sharp">
              {c.hex}
            </div>
            <div className="relative flex items-center justify-center px-6 py-16 min-h-[360px]">
              <video
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="relative z-0 w-auto h-auto max-w-[88vw] max-h-[50vh] md:max-h-[420px] object-contain"
              >
                <source src="/video/hero-orange.mp4" type="video/mp4" />
              </video>
            </div>
            <div className="bg-cream mx-auto max-w-[1200px] px-6 py-3 -mt-1">
              <p className="font-body text-sm text-grey">{c.note}</p>
            </div>
          </article>
        ))}
      </section>

      <footer className="mx-auto max-w-[1200px] px-6 py-12">
        <p className="font-mono text-meta uppercase tracking-mono-wide text-grey">
          Decide · /hero-test
        </p>
        <p className="font-body text-body mt-3">
          Tell me which hex wins. I&apos;ll wire it in as the brand orange
          across the site. If none are quite right, tell me &ldquo;between X
          and Y&rdquo; or &ldquo;X but slightly darker&rdquo; and I&apos;ll
          mix another round.
        </p>
      </footer>
    </main>
  );
}

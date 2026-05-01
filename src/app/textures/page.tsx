const grainSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/></svg>`;

const halftoneSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><circle cx='2' cy='2' r='0.9' fill='%23111111' fill-opacity='0.25'/></svg>`;

const columnsSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'><rect x='0' y='0' width='1' height='72' fill='%23111111' fill-opacity='0.12'/></svg>`;

const samples = [
  {
    key: "grain",
    title: "Option 1 · Subtle grain",
    blurb:
      "Fine procedural noise. The Apotheke / New Yorker look. Feels like aged cream paper.",
    style: { backgroundImage: `url("${grainSvg}")`, backgroundSize: "240px 240px" },
  },
  {
    key: "halftone",
    title: "Option 2 · Halftone dots",
    blurb:
      "Fine printed-dot grid. Stronger personality, leans retro magazine. Visible but restrained at this opacity.",
    style: { backgroundImage: `url("${halftoneSvg}")`, backgroundSize: "8px 8px" },
  },
  {
    key: "columns",
    title: "Option 3 · Column rules",
    blurb:
      "Faint vertical lines at newspaper-column spacing. Very front-page newsprint. Architectural.",
    style: { backgroundImage: `url("${columnsSvg}")`, backgroundSize: "72px 72px" },
  },
];

export default function TexturesPage() {
  return (
    <main className="min-h-screen bg-cream text-ink">
      <header className="mx-auto max-w-[1200px] px-6 py-16">
        <p className="font-mono text-meta uppercase tracking-mono-wide text-grey">
          Preview · Background textures
        </p>
        <h1 className="font-display text-4xl font-bold leading-headline mt-3 md:text-5xl">
          Pick a paper
        </h1>
        <p className="font-body text-body mt-4 max-w-reading text-grey">
          Each panel uses the same cream (#F5EED8) with a different overlay
          pattern. Scroll through and compare — the body copy below each title
          shows how each texture feels behind actual reading content.
        </p>
      </header>

      <section className="flex flex-col gap-0">
        {samples.map((s) => (
          <article
            key={s.key}
            className="bg-cream border-t border-ink/10"
            style={s.style}
          >
            <div className="mx-auto max-w-[1200px] px-6 py-20">
              <p className="font-mono text-meta uppercase tracking-mono-wide text-grey">
                {s.title}
              </p>
              <h2 className="font-display text-3xl font-bold leading-headline mt-3 md:text-5xl">
                The quiet power of textured paper
              </h2>
              <p className="font-body text-body-lg leading-reading mt-5 max-w-reading">
                Subtle background treatments do a lot of work in editorial
                design. They add tactility without shouting — a reader feels
                the difference before they consciously see it. The right
                texture makes a website feel like it was printed, not
                rendered.
              </p>
              <p className="font-body text-body leading-reading mt-4 max-w-reading text-grey">
                This panel shows how the texture sits behind body copy. Look
                at the cream in the margins and between paragraphs. Check how
                the text itself still reads cleanly. If the texture competes
                with the words, it's too loud.
              </p>
            </div>
          </article>
        ))}
      </section>

      <footer className="mx-auto max-w-[1200px] px-6 py-16">
        <p className="font-mono text-meta uppercase tracking-mono-wide text-grey">
          Decide · /textures
        </p>
        <p className="font-body text-body mt-3">
          Tell me which option (1, 2, 3, or none) and I&apos;ll wire it in
          across the site. Happy to tune opacity, dot size, or line spacing
          before committing.
        </p>
      </footer>
    </main>
  );
}

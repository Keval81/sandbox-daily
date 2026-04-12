import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-ink py-16">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-12 px-6 md:grid-cols-3">
        <div>
          <p className="font-display text-xl font-black uppercase tracking-tight text-cream">
            Sandbox Daily
          </p>
          <p className="font-mono text-meta uppercase tracking-mono text-grey mt-2">
            News · Tech · Sport
          </p>
        </div>
        <div>
          <p className="font-mono text-meta uppercase tracking-mono-wide text-grey mb-4">
            Sections
          </p>
          <div className="flex flex-col gap-2">
            <Link href="/news" className="font-mono text-meta uppercase tracking-mono text-cream hover:text-orange transition-colors cursor-pointer">News</Link>
            <Link href="/tech" className="font-mono text-meta uppercase tracking-mono text-cream hover:text-cream/70 transition-colors cursor-pointer">Tech</Link>
            <Link href="/sport" className="font-mono text-meta uppercase tracking-mono text-cream hover:text-accent transition-colors cursor-pointer">Sport</Link>
          </div>
        </div>
        <div>
          <p className="font-mono text-meta uppercase tracking-mono-wide text-grey mb-4">Subscribe</p>
          <p className="font-body text-sm text-cream/80 leading-reading">
            The sharpest analysis across News, Tech and Sport — direct to your inbox.
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] px-6 mt-12 pt-8 border-t border-grey/20">
        <p className="font-mono text-meta-sm uppercase tracking-mono-wide text-grey">
          &copy; 2026 Sandbox Daily
        </p>
      </div>
    </footer>
  );
}

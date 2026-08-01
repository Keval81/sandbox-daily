"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TypewriterText } from "./typewriter-text";
import { ThemeToggle } from "./theme-toggle";

const navLinks = [
  { href: "/news", label: "NEWS", indicator: "border-orange" },
  { href: "/tech", label: "TECH", indicator: "border-cream" },
  { href: "/sport", label: "SPORT", indicator: "border-accent" },
  { href: "/features", label: "FEATURES", indicator: "border-orange" },
  { href: "/pulse", label: "PULSE", indicator: "border-accent" },
];

export function Nav() {
  const pathname = usePathname();
  const onHero = pathname === "/";
  const [open, setOpen] = useState(false);
  const [heroScrolled, setHeroScrolled] = useState(false);

  useEffect(() => {
    if (!onHero) return;
    // Fixed 300px (was 70vh): the front page now opens with its own printed
    // masthead + section rail, so the fixed bar only needs to take over once
    // that rail has scrolled out of reach — roughly the masthead's height.
    const update = () => setHeroScrolled(window.scrollY > 300);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [onHero]);

  const solid = !onHero || heroScrolled || open;

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-30 sd-nav sd-chrome ${
        solid ? "sd-nav--solid" : "sd-nav--overlay"
      }`}
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-4">
        <Link
          href="/"
          aria-label="Sandbox Daily — home"
          className="flex items-center"
          onClick={() => setOpen(false)}
          // Pre-scroll on the hero the wordmark is visually empty (the masthead
          // does that job) — keep the Link mounted for layout, but a sighted
          // zero-size link left tabbable/announced is a trap for keyboard and
          // screen-reader users. Restored the moment it has content (solid).
          tabIndex={solid ? undefined : -1}
          aria-hidden={solid ? undefined : true}
        >
          {solid && (
            <TypewriterText
              text="Sandbox Daily"
              charMs={80}
              className="font-display text-2xl md:text-3xl font-black uppercase tracking-tight text-cream leading-none"
            />
          )}
        </Link>

        {/* Desktop nav. Pre-scroll on `/` the whole bar has no nav bar at
            all — the folio row owns the top edge (Night Edition v3) — so
            the links render only once `solid` (mirrors the wordmark's own
            `{solid && ...}` above, same threshold, same instant).
            CONSTRAINT (a11y tradeoff, accepted): unmounting rather than
            visually hiding means these links leave the tab order entirely
            pre-scroll, not just off-screen. A keyboard user landing on `/`
            reaches every section via the footer instead; the links return
            to the tab order the moment the bar solidifies (on scroll, or
            via `open`/mobile menu once the hamburger itself is mounted). */}
        {solid && (
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`font-mono text-meta-sm uppercase tracking-mono-wide cursor-pointer border-b-2 pb-1 transition-colors duration-200 ${
                    isActive
                      ? `text-cream ${link.indicator}`
                      : "text-grey border-transparent hover:text-cream"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <span className="text-cream">
              <ThemeToggle />
            </span>
          </div>
        )}

        {/* Mobile hamburger — same pre-scroll unmount as the desktop links
            above (see the a11y note there); with the trigger gone, `open`
            can never flip true before the bar solidifies, so the mobile
            menu block below never needs its own guard. */}
        {solid && (
          <button
            type="button"
            className="md:hidden text-cream cursor-pointer p-2"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? (
                <path d="M6 6l12 12M6 18L18 6" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        )}
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-ink border-t border-grey/20 px-6 py-4">
          {navLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`block py-3 font-mono text-meta uppercase tracking-mono-wide cursor-pointer ${
                  isActive ? "text-cream" : "text-grey"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="py-3 text-cream">
            <ThemeToggle />
          </div>
        </div>
      )}
    </nav>
  );
}

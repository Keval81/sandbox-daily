"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TypewriterText } from "./typewriter-text";

const navLinks = [
  { href: "/news", label: "NEWS", indicator: "border-orange" },
  { href: "/tech", label: "TECH", indicator: "border-cream" },
  { href: "/sport", label: "SPORT", indicator: "border-accent" },
  { href: "/features", label: "FEATURES", indicator: "border-orange" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-30 bg-ink">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-4">
        <Link
          href="/"
          aria-label="Sandbox Daily — home"
          className="flex items-center"
          onClick={() => setOpen(false)}
        >
          <TypewriterText
            text="Sandbox Daily"
            charMs={80}
            className="font-display text-2xl md:text-3xl font-black uppercase tracking-tight text-cream leading-none"
          />
        </Link>

        {/* Desktop nav */}
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
        </div>

        {/* Mobile hamburger */}
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
        </div>
      )}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/news", label: "NEWS", indicator: "border-orange" },
  { href: "/tech", label: "TECH", indicator: "border-cream" },
  { href: "/sport", label: "SPORT", indicator: "border-accent" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-30 bg-ink">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-2xl font-black uppercase tracking-tight text-cream">
          Sandbox Daily
        </Link>
        <div className="flex items-center gap-8">
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
      </div>
    </nav>
  );
}

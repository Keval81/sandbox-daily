"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Edition switch: DAY (vellum) / NIGHT (night stock). The pre-paint script in
 * layout.tsx has already stamped html[data-theme] before this mounts; this
 * button just flips the attribute and persists the choice. `theme` starts
 * null so the server HTML and the first client render agree (a neutral
 * label), and the real state is read from the DOM after mount.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Deferred, not synchronous — same pattern as the folio/data clocks: the
    // first client render must match the server HTML (neutral label), and the
    // real theme is read off the DOM a tick later.
    const sync = () =>
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    const id = setTimeout(sync, 0);
    return () => clearTimeout(id);
  }, []);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("sd-theme", next);
    } catch {
      // Private browsing: the flip still applies for this page view.
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={flip}
      // Neutral until mounted; then names the edition it switches TO.
      aria-label={theme === "dark" ? "Switch to the day edition" : "Switch to the night edition"}
    >
      {theme === "dark" ? "☀ DAY" : theme === "light" ? "☾ NIGHT" : "◐ EDITION"}
    </button>
  );
}

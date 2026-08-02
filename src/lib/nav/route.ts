/**
 * Vercel serves the prerendered root route rendered as `/index` — the
 * prerender-manifest key for `/` — so `usePathname()` returns `"/index"` in a
 * production server render while the browser reports `"/"`. Any component that
 * branches on the raw pathname to decide its MARKUP therefore renders one tree
 * on the server and a different one on the client: React 19 fails hydration
 * (#418), throws the whole SSR tree away and re-renders the document, which in
 * turn wipes `html[data-theme]` stamped by layout.tsx's pre-paint script and
 * remounts every client component. Confirmed on the deployed site 2026-08-02:
 * prod's flight payload reads `"c":["","index"]` where a local build reads
 * `"c":["",""]`, so this reproduces on Vercel only — never in `next dev`, never
 * in a local `next build && next start`.
 *
 * Normalise before branching. Not a Vercel workaround to be removed later: any
 * host is free to render a route under its manifest key.
 */
export const normalisePathname = (pathname: string): string =>
  pathname === "/index" ? "/" : pathname;

/** True on the front page, under either spelling of its path. */
export const isFrontPage = (pathname: string): boolean =>
  normalisePathname(pathname) === "/";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to this project. Without this, a stray
  // package-lock.json in the user's home directory makes Turbopack infer
  // ~/ as the workspace and write build artifacts there — breaking dev
  // mode with ENOENT on .next/dev/routes-manifest.json.
  // process.cwd() works because npm run dev always runs from project root.
  turbopack: {
    root: process.cwd(),
  },
  // Several routes read article markdown via fs at runtime (/api/review,
  // /review, /admin/workflow, the vertical/slug pages). That makes Next.js
  // trace the whole project — including every image/video in public/ — into
  // each serverless function bundle, blowing Vercel's function size limit
  // (build compiles fine, then the deploy ERRORs at function packaging).
  // No function serves binary media (Vercel's static CDN does), so exclude
  // it from ALL function bundles. Functions still get the markdown they read.
  outputFileTracingExcludes: {
    "**": [
      "public/images/**/*",
      "public/video/**/*",
      "public/**/*.mp4",
      "public/**/*.webp",
      "public/**/*.png",
      "public/**/*.jpg",
      "public/**/*.jpeg",
      // Local-only redesign working assets (~391MB) — never needed by any
      // function; also kept out of uploads via .vercelignore.
      "design-source/**/*",
      // Local-only archive of rejected articles + their hero images (~357MB).
      // /api/review (which writes here) is disabled in production; this archive
      // exists only for local recovery. It was the actual cause of the
      // api/review function exceeding Vercel's 250MB limit (357MB of the 359MB).
      ".review-discarded/**/*",
    ],
  },
  async redirects() {
    return [
      { source: "/spotlights", destination: "/features", permanent: true },
      { source: "/spotlights/:slug", destination: "/features/:slug", permanent: true },
    ];
  },
};

export default nextConfig;

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
  // The /api/review function reads markdown via fs at runtime, which makes
  // Next.js trace the entire content + image trees into its bundle (~350MB,
  // exceeds Vercel's 300MB function size limit). Exclude the heavy assets —
  // the route only needs the markdown frontmatter, not the images themselves.
  outputFileTracingExcludes: {
    "/api/review": [
      "public/images/articles/**/*",
      "public/video/**/*",
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

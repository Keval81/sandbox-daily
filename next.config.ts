import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

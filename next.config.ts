import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lint runs on its own (`pnpm lint`), not inside `next build`: the codebase still has
  // pre-existing lint errors (mostly `any` in tests and actions) that would fail every build.
  // Type errors still fail the build. Remove this once `pnpm lint` passes cleanly.
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async rewrites() {
    return {
      // Runs only when no build-time public/ file matched: files uploaded after the build
      // are served from disk by app/api/uploads/[...path]/route.ts.
      afterFiles: [{ source: "/uploads/:path*", destination: "/api/uploads/:path*" }],
    };
  },
  async headers() {
    return [
      {
        // User-uploaded files must never execute script if opened directly (e.g. a hostile SVG).
        source: "/uploads/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;

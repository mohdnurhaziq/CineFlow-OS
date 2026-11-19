import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't announce the framework (X-Powered-By: Next.js).
  poweredByHeader: false,
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
        // Every page: no other site may show it in a frame (to trick a click on "Approve payment"),
        // links don't leak full addresses to other sites, and files keep their declared type.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
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

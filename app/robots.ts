import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { appEnvFrom } from "@/lib/app-env";

export default function robots(): MetadataRoute.Robots {
  // The staging copy is a test copy: keep every page out of search engines.
  if (appEnvFrom() === "staging") return { rules: [{ userAgent: "*", disallow: "/" }] };

  const baseUrl = env.NEXT_PUBLIC_APP_URL;

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/create-studio",
          "/*",
          "/*/book",
          "/*/visualizer",
        ],
        disallow: [
          "/api/",
          "/super-admin",
          "/*/admin",
          "/*/admin/*",
          "/*/checkout",
          "/*/checkout/*",
          "/*/vault",
          "/*/vault/*",
          "/*/proposals",
          "/*/proposals/*",
          "/*/set-hud",
          "/*/set-hud/*",
          "/*/releases",
          "/*/releases/*",
          "/_next/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

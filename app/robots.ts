import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { appEnvFrom } from "@/lib/app-env";
import { requestHost } from "@/lib/auth/token";
import { studioSubdomainOf, studioSubdomainsOn, studioUrl } from "@/lib/domain-name";

/** A studio's private pages: its admin, payments, galleries, client accounts and crew pages. */
const PRIVATE = ["admin", "checkout", "vault", "account", "proposals", "set-hud", "releases"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  // The staging copy is a test copy: keep every page out of search engines.
  if (appEnvFrom() === "staging") return { rules: [{ userAgent: "*", disallow: "/" }] };

  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  // With studio subdomains on, each host has its own rules: a studio's pages have no /<slug>/.
  if (studioSubdomainsOn()) {
    const slug = studioSubdomainOf(await requestHost());
    if (slug) {
      return {
        rules: [{ userAgent: "*", allow: ["/", "/book", "/visualizer"], disallow: [...PRIVATE.flatMap((p) => [`/${p}`, `/${p}/*`]), "/_next/"] }],
        sitemap: studioUrl(slug, "/sitemap.xml"),
      };
    }
    return {
      rules: [{ userAgent: "*", allow: ["/", "/create-studio"], disallow: ["/api/", "/super-admin", "/_next/"] }],
      sitemap: `${baseUrl}/sitemap.xml`,
    };
  }

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

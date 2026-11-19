import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { studioSubdomainOf, studioSubdomainsOn, studioUrl } from "@/lib/domain-name";
import { requestHost } from "@/lib/auth/token";

/**
 * With studio subdomains off, one sitemap lists the platform and every studio. With them on,
 * each host lists only its own pages: search engines ignore entries on another host.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  if (studioSubdomainsOn()) {
    const slug = studioSubdomainOf(await requestHost());
    if (slug) {
      const tenant = await db.tenant.findUnique({ where: { slug }, select: { updatedAt: true } }).catch(() => null);
      if (!tenant) return [];
      const page = (path: string, changeFrequency: "daily" | "weekly" | "monthly", priority: number) => ({
        url: studioUrl(slug, path),
        lastModified: tenant.updatedAt,
        changeFrequency,
        priority,
      });
      return [page("/", "weekly", 1.0), page("/book", "daily", 0.9), page("/visualizer", "monthly", 0.7)];
    }
  }

  // Base platform routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/create-studio`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
  if (studioSubdomainsOn()) return staticRoutes;

  try {
    const tenants = await db.tenant.findMany({
      select: {
        slug: true,
        updatedAt: true,
      },
    });

    const tenantRoutes: MetadataRoute.Sitemap = tenants.flatMap((tenant) => [
      {
        url: studioUrl(tenant.slug, "/"),
        lastModified: tenant.updatedAt || new Date(),
        changeFrequency: "weekly",
        priority: 0.9,
      },
      {
        url: studioUrl(tenant.slug, "/book"),
        lastModified: tenant.updatedAt || new Date(),
        changeFrequency: "daily",
        priority: 0.85,
      },
      {
        url: studioUrl(tenant.slug, "/visualizer"),
        lastModified: tenant.updatedAt || new Date(),
        changeFrequency: "monthly",
        priority: 0.7,
      },
    ]);

    return [...staticRoutes, ...tenantRoutes];
  } catch (error) {
    console.error("Failed to generate sitemap tenants:", error);
    return staticRoutes;
  }
}

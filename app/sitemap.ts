import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

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

  try {
    const tenants = await db.tenant.findMany({
      select: {
        slug: true,
        updatedAt: true,
      },
    });

    const tenantRoutes: MetadataRoute.Sitemap = tenants.flatMap((tenant) => [
      {
        url: `${baseUrl}/${tenant.slug}`,
        lastModified: tenant.updatedAt || new Date(),
        changeFrequency: "weekly",
        priority: 0.9,
      },
      {
        url: `${baseUrl}/${tenant.slug}/book`,
        lastModified: tenant.updatedAt || new Date(),
        changeFrequency: "daily",
        priority: 0.85,
      },
      {
        url: `${baseUrl}/${tenant.slug}/visualizer`,
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

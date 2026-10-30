import { db } from "@/lib/db";
import { notFound } from "next/navigation";

export async function getTenantBySlug(slug: string) {
  if (!slug) return null;

  return db.tenant.findUnique({
    where: { slug },
    include: {
      campaignCategories: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
      servicePackages: {
        where: { isFeatured: true },
      },
      printSizes: {
        orderBy: { widthInches: "asc" },
      },
      frameDesigns: {
        where: { isAvailable: true },
      },
    },
  });
}

export async function requireTenantBySlug(slug: string) {
  const tenant = await getTenantBySlug(slug);
  if (!tenant) {
    notFound();
  }
  return tenant;
}

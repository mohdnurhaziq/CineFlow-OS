import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { CmsManager } from "@/components/admin/cms/cms-manager";
import type { ShowcaseItemRow, CategoryOption, PackageOption } from "@/components/admin/cms/showcase-item-dialog";

interface CmsPageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

export async function generateMetadata({
  params,
}: CmsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { title: "CMS Not Found" };

  return {
    title: `Showcase Portfolio CMS | ${tenant.name} Studio Admin`,
    description: "Manage published portfolio films, campaigns, gallery covers, and featured showcases.",
  };
}

export default async function AdminCmsPage({ params }: CmsPageProps) {
  const { tenantSlug } = await params;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (!tenant) notFound();

  // 2. Fetch scoped showcase items
  const items = await db.showcaseItem.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { title: "asc" }],
  });

  // 3. Fetch categories for tagging
  const categories = await db.campaignCategory.findMany({
    where: { tenantId: tenant.id },
    orderBy: { sortOrder: "asc" },
  });

  // 4. Fetch packages for linking
  const packages = await db.servicePackage.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <CmsManager
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        initialItems={items as unknown as ShowcaseItemRow[]}
        categories={categories as unknown as CategoryOption[]}
        packages={packages as unknown as PackageOption[]}
      />
    </div>
  );
}

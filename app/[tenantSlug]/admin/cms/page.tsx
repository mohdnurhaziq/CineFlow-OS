import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { CmsManager } from "@/components/admin/cms/cms-manager";
import type { ShowcaseItemRow, CategoryOption, PackageOption } from "@/components/admin/cms/showcase-item-dialog";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";
import { studioAdminName } from "@/lib/labels";

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
    title: `Showcase CMS | ${studioAdminName(tenant.name)}`,
    description: "Manage published portfolio films, campaigns, gallery covers, and featured showcases.",
  };
}

// Catalog VIEW.
export default async function AdminCmsPage({ params }: CmsPageProps) {
  const { tenantSlug } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.catalog, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;

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
  const packageRows = await db.servicePackage.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, isActive: true },
    orderBy: { name: "asc" },
  });
  // Switched-off packages can still be linked, but the website won't show them.
  const packages = packageRows.map((p) => ({ id: p.id, name: p.isActive ? p.name : `${p.name} (off)` }));

  return (
    <PageShell>
      <CmsManager
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        initialItems={items as unknown as ShowcaseItemRow[]}
        categories={categories as unknown as CategoryOption[]}
        packages={packages as unknown as PackageOption[]}
        canManage={levelAtLeast(viewer.access.areas.catalog, "MANAGE")}
      />
    </PageShell>
  );
}

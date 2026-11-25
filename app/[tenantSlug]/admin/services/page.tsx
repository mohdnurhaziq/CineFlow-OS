import { printsOffered } from "@/lib/billing/guard";
import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";
import { ServicesDashboard } from "@/components/admin/services/services-dashboard";
import type { PackageRow } from "@/components/admin/services/package-dialog";
import type { CategoryRow } from "@/components/admin/services/category-dialog";

interface ServicesPageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

export async function generateMetadata({
  params,
}: ServicesPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { title: "Services Not Found" };

  return {
    title: `Services | ${tenant.name} Studio Admin`,
    description: "Manage service packages, pricing, deliverables, and campaign categories.",
  };
}

// Services VIEW. Packages and their prices need setPrices; categories Services MANAGE.
export default async function AdminServicesPage({ params }: ServicesPageProps) {
  const { tenantSlug } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.services, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
      discipline: true,
    },
  });

  if (!tenant) notFound();

  // 2. Fetch scoped packages
  const packages = await db.servicePackage.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ isFeatured: "desc" }, { price: "desc" }],
    include: {
      includedPrints: {
        select: { printSizeId: true, frameDesignId: true, quantity: true },
        orderBy: { id: "asc" },
      },
    },
  });

  // Sizes and frames a package can include (only those on offer)
  const [printSizes, frames] = await Promise.all([
    db.printSize.findMany({
      where: { tenantId: tenant.id, isAvailable: true },
      orderBy: { widthInches: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.frameDesign.findMany({
      where: { tenantId: tenant.id, isAvailable: true },
      orderBy: { priceOffset: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // 3. Fetch scoped categories
  const categories = await db.campaignCategory.findMany({
    where: { tenantId: tenant.id },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <PageShell>
      <ServicesDashboard
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        initialPackages={packages as unknown as PackageRow[]}
        initialCategories={categories as unknown as CategoryRow[]}
        printSizes={printSizes}
        frames={frames}
        showPrints={await printsOffered(tenant.id)}
        canSetPrices={viewer.access.ticks.setPrices}
        canManage={levelAtLeast(viewer.access.areas.services, "MANAGE")}
      />
    </PageShell>
  );
}

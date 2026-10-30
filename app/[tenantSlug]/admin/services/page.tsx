import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
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
    title: `Packages & Categories | ${tenant.name} Studio Admin`,
    description: "Manage service packages, pricing, deliverables, and campaign categories.",
  };
}

export default async function AdminServicesPage({ params }: ServicesPageProps) {
  const { tenantSlug } = await params;

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
  });

  // 3. Fetch scoped categories
  const categories = await db.campaignCategory.findMany({
    where: { tenantId: tenant.id },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <ServicesDashboard
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        initialPackages={packages as unknown as PackageRow[]}
        initialCategories={categories as unknown as CategoryRow[]}
      />
    </div>
  );
}

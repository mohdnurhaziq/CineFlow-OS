import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { GearDashboard } from "@/components/gear/gear-dashboard";
import type { InventoryItemRow } from "@/components/gear/gear-item-dialog";
import type { KitBundleRow } from "@/components/gear/kit-bundle-dialog";
import type { ReservationWithDetails } from "@/components/gear/inspection-dialog";

interface InventoryPageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

export async function generateMetadata({
  params,
}: InventoryPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { title: "Inventory Not Found" };

  return {
    title: `Gear Inventory & Kit BOM | ${tenant.name}`,
    description: "Manage equipment fleet, kit bundle recipes, and pre/post-shoot inspection condition logs.",
  };
}

export default async function InventoryPage({ params }: InventoryPageProps) {
  const { tenantSlug } = await params;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
  });
  if (!tenant) notFound();

  // 2. Fetch inventory items strictly scoped to this tenant
  const items = await db.inventoryItem.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  // 3. Fetch kit bundles with constituent items strictly scoped to this tenant
  const bundles = await db.kitBundle.findMany({
    where: { tenantId: tenant.id },
    include: {
      items: {
        include: {
          item: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // 4. Fetch equipment reservations strictly scoped to this tenant's projects
  const reservations = await db.equipmentReservation.findMany({
    where: {
      project: { tenantId: tenant.id },
    },
    include: {
      project: true,
      item: true,
      inspection: true,
    },
    orderBy: { startDate: "desc" },
  });

  const currencySymbol = tenant.currency === "MYR" ? "RM" : "$";

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <GearDashboard
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={currencySymbol}
        initialItems={items as InventoryItemRow[]}
        initialBundles={bundles as unknown as KitBundleRow[]}
        initialReservations={reservations as unknown as ReservationWithDetails[]}
      />
    </div>
  );
}

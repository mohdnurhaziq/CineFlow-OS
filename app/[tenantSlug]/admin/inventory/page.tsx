import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { currencySymbol } from "@/lib/money";
import { getCurrentUser } from "@/lib/auth/session";
import { GearDashboard } from "@/components/gear/gear-dashboard";
import type { InventoryItemRow } from "@/components/gear/gear-item-dialog";
import type { KitBundleRow } from "@/components/gear/kit-bundle-dialog";
import type { ReservationWithDetails } from "@/components/gear/inspection-dialog";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";
import { bundleWithRates, seesGearRates, withRate } from "@/lib/gear/rates";
import { PlanPanel } from "@/components/billing/plan-panel";

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
    title: `Gear & Fleet | ${tenant.name} Studio Admin`,
    description: "Manage equipment fleet, kit bundle recipes, and pre/post-shoot inspection condition logs.",
  };
}

// Production VIEW.
export default async function InventoryPage({ params }: InventoryPageProps) {
  const { tenantSlug } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.production, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;

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


  const user = await getCurrentUser();
  // Day rates are money: without Invoices View they aren't sent at all.
  const showRates = seesGearRates(viewer.access);

  return (
    <PageShell>
      <PlanPanel tenantId={tenant.id} feature="gear" role={viewer.user.role} />
      <GearDashboard
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={currencySymbol(tenant.currency)}
        initialItems={items.map((i) => withRate(i, showRates)) as InventoryItemRow[]}
        initialBundles={bundles.map((b) => bundleWithRates(b, showRates)) as unknown as KitBundleRow[]}
        initialReservations={reservations.map((r) => ({ ...r, item: withRate(r.item, showRates) })) as unknown as ReservationWithDetails[]}
        inspectorName={user?.name ?? "Studio staff"}
        canManage={levelAtLeast(viewer.access.areas.production, "MANAGE")}
        showRates={showRates}
      />
    </PageShell>
  );
}

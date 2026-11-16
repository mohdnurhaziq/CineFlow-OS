import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { loadItemPreviews } from "@/lib/prints/gallery";
import { PageShell } from "@/components/ui/page";
import { PrintOrdersConsole, type PrintOrderRow } from "@/components/admin/print-orders/print-orders-console";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";

interface PrintOrdersPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: PrintOrdersPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Print orders | ${tenant.name} Studio Admin` : "Print orders" };
}

// Print orders VIEW.
export default async function AdminPrintOrdersPage({ params }: PrintOrdersPageProps) {
  const { tenantSlug } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.printOrders, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true, currency: true } });
  if (!tenant) notFound();

  const orders = await db.printOrder.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { name: true, email: true } },
      project: { select: { title: true } },
      items: { select: { deliverableItemId: true } },
    },
  });
  const previewById = await loadItemPreviews(orders.flatMap((o) => o.items.map((i) => i.deliverableItemId)));

  const rows: PrintOrderRow[] = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    fulfilment: o.fulfilment,
    totalAmount: o.totalAmount,
    clientName: o.client.name,
    clientEmail: o.client.email,
    projectTitle: o.project.title,
    itemCount: o.items.length,
    thumbnails: o.items
      .map((i) => (i.deliverableItemId ? previewById.get(i.deliverableItemId) : undefined))
      .filter((u): u is string => !!u)
      .slice(0, 3),
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <PageShell>
      <PrintOrdersConsole tenantSlug={tenant.slug} currency={tenant.currency} orders={rows} />
    </PageShell>
  );
}

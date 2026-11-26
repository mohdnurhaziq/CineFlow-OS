import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { milestoneInstallmentLabel, studioAdminName } from "@/lib/labels";
import { InvoicesConsole, type InvoiceRow } from "@/components/admin/invoices/invoices-console";
import { NewInvoiceButton } from "@/components/admin/invoices/new-invoice-dialog";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";
import { isPastDue } from "@/lib/slot-time";

interface InvoicesPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: InvoicesPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Invoices | ${studioAdminName(tenant.name)}` : "Invoices" };
}

// Invoices VIEW. A new invoice sets a price: the setPrices permission.
export default async function AdminInvoicesPage({ params }: InvoicesPageProps) {
  const { tenantSlug } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.invoices, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, currency: true },
  });
  if (!tenant) notFound();

  const invoices = await db.milestoneInvoice.findMany({
    where: { tenantId: tenant.id },
    include: {
      client: { select: { name: true, email: true } },
      booking: { select: { trackingCode: true, packageName: true } },
      project: { select: { title: true, projectNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const canSetPrices = viewer.access.ticks.setPrices;
  const clients = canSetPrices
    ? await db.user.findMany({
        where: { tenantId: tenant.id, role: "CLIENT" },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
        take: 1000,
      })
    : [];

  const now = new Date();
  const rows: InvoiceRow[] = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    type: inv.milestoneType,
    typeLabel: milestoneInstallmentLabel(inv.milestoneType),
    // Overdue is derived here so the server and browser render the same thing.
    status: inv.status === "PENDING" && isPastDue(inv.dueDate, now) ? "OVERDUE" : inv.status,
    amount: inv.amount,
    clientName: inv.client.name,
    clientEmail: inv.client.email,
    reference: inv.description
      ? inv.description
      : inv.booking
      ? [inv.booking.packageName, inv.booking.trackingCode].filter(Boolean).join(" · ")
      : inv.project
        ? `${inv.project.title} · ${inv.project.projectNumber}`
        : null,
    issuedAt: inv.createdAt.toISOString(),
    dueDate: inv.dueDate.toISOString(),
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
  }));

  return (
    <PageShell>
      <InvoicesConsole
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        invoices={rows}
        actions={
          canSetPrices ? (
            <NewInvoiceButton tenantId={tenant.id} tenantSlug={tenant.slug} currency={tenant.currency} clients={clients} />
          ) : null
        }
      />
    </PageShell>
  );
}

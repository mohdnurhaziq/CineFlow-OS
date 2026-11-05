import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { milestoneTitle } from "@/lib/invoices/document";
import { InvoicesConsole, type InvoiceRow } from "@/components/admin/invoices/invoices-console";
import { NewInvoiceButton } from "@/components/admin/invoices/new-invoice-dialog";
import { currentUserIsOwner } from "@/lib/auth/owner";

interface InvoicesPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: InvoicesPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Invoices | ${tenant.name} Studio Admin` : "Invoices | CineFlow OS" };
}

// Access is enforced by the admin layout (studio staff or super-admin only).
export default async function AdminInvoicesPage({ params }: InvoicesPageProps) {
  const { tenantSlug } = await params;
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

  const isOwner = await currentUserIsOwner();
  const clients = isOwner
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
    typeLabel: milestoneTitle(inv.milestoneType),
    // Overdue is derived here so the server and browser render the same thing.
    status: inv.status === "PENDING" && inv.dueDate < now ? "OVERDUE" : inv.status,
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
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <InvoicesConsole
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        invoices={rows}
        actions={
          isOwner ? (
            <NewInvoiceButton tenantId={tenant.id} tenantSlug={tenant.slug} currency={tenant.currency} clients={clients} />
          ) : null
        }
      />
    </div>
  );
}

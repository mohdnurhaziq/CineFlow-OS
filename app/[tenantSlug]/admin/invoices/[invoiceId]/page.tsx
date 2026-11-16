import { PageShell } from "@/components/ui/page";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { loadInvoiceDocument } from "@/lib/invoices/document";
import { InvoiceDocumentView } from "@/components/invoices/invoice-document";
import { PrintButton } from "@/components/invoices/print-button";
import { InvoiceAdminActions } from "@/components/admin/invoices/invoice-admin-actions";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";

interface AdminInvoicePageProps {
  params: Promise<{ tenantSlug: string; invoiceId: string }>;
}

export async function generateMetadata({ params }: AdminInvoicePageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Invoice | ${tenant.name} Studio Admin` : "Invoice" };
}

// Invoices VIEW. Recording or cancelling a payment needs recordPayments; a reminder Invoices MANAGE.
export default async function AdminInvoicePage({ params }: AdminInvoicePageProps) {
  const { tenantSlug, invoiceId } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.invoices, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true } });
  if (!tenant) notFound();

  const doc = await loadInvoiceDocument(tenant.id, invoiceId);
  if (!doc) notFound();

  return (
    <PageShell width="document" className="print:p-0 print:max-w-none space-y-4">
      <InvoiceAdminActions
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        invoiceId={doc.id}
        status={doc.status}
        milestoneType={doc.milestoneType}
        canRecordPayments={viewer.access.ticks.recordPayments}
        canManage={levelAtLeast(viewer.access.areas.invoices, "MANAGE")}
      />
      <InvoiceDocumentView
        doc={doc}
        actions={
          <>
            <AdminBreadcrumb
              className="mr-auto"
              items={[
                { label: "Finance" },
                { label: "Invoices", href: `/${tenant.slug}/admin/invoices` },
                { label: doc.invoiceNumber },
              ]}
            />
            {doc.status === "PENDING_VERIFICATION" && (
              <Link
                href={`/${tenant.slug}/admin/verification`}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-500 text-white text-xs font-bold hover:bg-blue-400 transition-colors"
              >
                <ShieldCheck className="size-4" />
                Verify payment
              </Link>
            )}
            <PrintButton doc={doc} />
          </>
        }
      />
    </PageShell>
  );
}

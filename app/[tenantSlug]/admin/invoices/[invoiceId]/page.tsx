import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { loadInvoiceDocument } from "@/lib/invoices/document";
import { InvoiceDocumentView } from "@/components/invoices/invoice-document";
import { PrintButton } from "@/components/invoices/print-button";
import { InvoiceAdminActions } from "@/components/admin/invoices/invoice-admin-actions";
import { currentUserIsOwner } from "@/lib/auth/owner";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";

interface AdminInvoicePageProps {
  params: Promise<{ tenantSlug: string; invoiceId: string }>;
}

export async function generateMetadata({ params }: AdminInvoicePageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Invoice | ${tenant.name} Studio Admin` : "Invoice" };
}

// Access is enforced by the admin layout (studio staff or super-admin only).
export default async function AdminInvoicePage({ params }: AdminInvoicePageProps) {
  const { tenantSlug, invoiceId } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true } });
  if (!tenant) notFound();

  const doc = await loadInvoiceDocument(tenant.id, invoiceId);
  if (!doc) notFound();

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 max-w-3xl mx-auto print:p-0 print:max-w-none space-y-4">
      <InvoiceAdminActions
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        invoiceId={doc.id}
        status={doc.status}
        milestoneType={doc.milestoneType}
        isOwner={await currentUserIsOwner()}
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
    </div>
  );
}

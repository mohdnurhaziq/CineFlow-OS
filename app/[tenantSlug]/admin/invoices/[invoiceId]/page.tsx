import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { loadInvoiceDocument } from "@/lib/invoices/document";
import { InvoiceDocumentView } from "@/components/invoices/invoice-document";
import { PrintButton } from "@/components/invoices/print-button";

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
    <div className="py-6 sm:py-8 px-4 sm:px-6 max-w-3xl mx-auto print:p-0 print:max-w-none">
      <InvoiceDocumentView
        doc={doc}
        actions={
          <>
            <Link
              href={`/${tenant.slug}/admin/invoices`}
              className="mr-auto inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="size-3.5" />
              All invoices
            </Link>
            {doc.status === "PENDING_VERIFICATION" && (
              <Link
                href={`/${tenant.slug}/admin/verification`}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-500 text-white text-xs font-bold hover:bg-blue-400 transition-colors"
              >
                <ShieldCheck className="size-4" />
                Verify payment
              </Link>
            )}
            <PrintButton />
          </>
        }
      />
    </div>
  );
}

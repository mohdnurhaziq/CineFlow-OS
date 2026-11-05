import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CreditCard, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadInvoiceDocument } from "@/lib/invoices/document";
import { InvoiceDocumentView, invoiceStatus } from "@/components/invoices/invoice-document";
import { PrintButton } from "@/components/invoices/print-button";

interface ClientInvoicePageProps {
  params: Promise<{ tenantSlug: string; invoiceId: string }>;
}

export async function generateMetadata({ params }: ClientInvoicePageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Invoice | ${tenant.name}` : "Invoice", robots: { index: false } };
}

export default async function ClientInvoicePage({ params }: ClientInvoicePageProps) {
  const { tenantSlug, invoiceId } = await params;

  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true } });
  if (!tenant) notFound();

  const self = `/${tenant.slug}/account/invoices/${invoiceId}`;
  const session = await getCurrentUser();
  if (!session) redirect(`/${tenant.slug}/login?callbackUrl=${encodeURIComponent(self)}`);
  // Studio staff see invoices in the admin console.
  if (session.role !== "CLIENT") redirect(`/${tenant.slug}/admin/invoices/${invoiceId}`);
  if (session.tenantId !== tenant.id) redirect(`/${tenant.slug}/login?callbackUrl=${encodeURIComponent(self)}`);

  const doc = await loadInvoiceDocument(tenant.id, invoiceId);
  // Only the client the invoice is addressed to may see it; anything else looks like it doesn't exist.
  if (!doc || doc.client.id !== session.id) notFound();

  const status = invoiceStatus(doc);
  const canPay = status === "PENDING" || status === "OVERDUE";
  const needsSlip =
    (status === "PENDING_VERIFICATION" && doc.paymentMethod === "QR_CODE" && !doc.paymentProofUrl) ||
    // The studio rejected the slip: send a new one.
    status === "REJECTED";

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] print:bg-white print:min-h-0">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 print:p-0 print:max-w-none">
        <InvoiceDocumentView
          doc={doc}
          actions={
            <>
              <Link
                href={`/${tenant.slug}/account`}
                className="mr-auto inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white"
              >
                <ArrowLeft className="size-3.5" />
                My account
              </Link>
              {(canPay || needsSlip) && (
                <Link
                  href={`/${tenant.slug}/checkout?invoiceId=${doc.id}`}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-colors"
                >
                  {needsSlip ? <Upload className="size-4" /> : <CreditCard className="size-4" />}
                  {status === "REJECTED" ? "Send a new payment slip" : needsSlip ? "Upload payment slip" : "Pay this invoice"}
                </Link>
              )}
              <PrintButton doc={doc} />
            </>
          }
        />
      </main>
    </div>
  );
}

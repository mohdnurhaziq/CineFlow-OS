import { buttonVariants } from "@/components/ui/button";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { settleToyyibpayBill } from "@/lib/payments/settle";
import { getCurrentUser } from "@/lib/auth/session";
import { StudioPageHeader } from "@/components/layout/studio-page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment status", robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ billcode?: string; status_id?: string }>;
}

/** Where Toyyibpay sends the browser back. The URL is untrusted: we re-check with the gateway. */
export default async function PaymentReturnPage({ params, searchParams }: Props) {
  const { tenantSlug } = await params;
  const { billcode } = await searchParams;
  if (typeof billcode !== "string" || !billcode) notFound();

  const outcome = await settleToyyibpayBill(billcode);
  if (outcome.status === "NOT_FOUND") notFound();
  if ("tenantSlug" in outcome && outcome.tenantSlug !== tenantSlug) notFound();

  // Signed-in clients see everything in their account; the tracking-code page is for guests.
  const session = await getCurrentUser();
  const signedInClient = session?.role === "CLIENT" && session.tenantSlug === tenantSlug;

  if (outcome.status === "PAID" && !outcome.refundRequired) {
    if (outcome.trackingCode && !signedInClient) {
      redirect(`/${tenantSlug}/my-booking?code=${encodeURIComponent(outcome.trackingCode)}`);
    }
    // Same landing as the other payment methods: the booking (with its confirmation) or the
    // paid invoice's receipt.
    redirect(
      outcome.trackingCode
        ? `/${tenantSlug}/account?tab=bookings&confirmed=${encodeURIComponent(outcome.trackingCode)}`
        : `/${tenantSlug}/account/invoices/${outcome.invoiceId}?paid=1`
    );
  }

  const message =
    outcome.status === "PAID"
      ? outcome.refundReason === "INVOICE_CANCELLED"
        ? "Your payment was received, but this invoice was cancelled before it completed. The studio will contact you to arrange a refund."
        : "Your payment was received, but the time slot was released before it completed. The studio will contact you to arrange a refund or a new time."
      : outcome.status === "MISMATCH"
        ? "We received a payment that does not match this invoice. The studio has been flagged to review it."
        : "We have not received confirmation of your payment yet. If you completed it, this can take a minute.";

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col selection:bg-amber-500/20 selection:text-amber-400">
      <StudioPageHeader tenantSlug={tenantSlug} staffView="website" />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
      <div role="status" className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#121215] p-8 text-center space-y-4 shadow-2xl">
        <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">Payment</span>
        <h1 className="text-2xl font-bold tracking-tight text-white">Payment status</h1>
        <p className="text-sm text-zinc-300">{message}</p>
        <div className="flex flex-col sm:flex-row justify-center gap-2 pt-2">
          {outcome.status === "NOT_PAID" && (
            <Link
              className={buttonVariants({ size: "lg" })}
              href={`/${tenantSlug}/checkout/payment-return?billcode=${encodeURIComponent(billcode)}`}
            >
              Check again
            </Link>
          )}
          <Link
            className="inline-flex items-center justify-center min-h-11 px-4 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 hover:text-white text-xs font-semibold transition-colors"
            href={signedInClient ? `/${tenantSlug}/account` : `/${tenantSlug}/my-booking`}
          >
            {signedInClient ? "My account" : "My booking"}
          </Link>
        </div>
      </div>
      </main>
    </div>
  );
}

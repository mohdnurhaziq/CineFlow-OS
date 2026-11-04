import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { settleToyyibpayBill } from "@/lib/payments/settle";

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

  if (outcome.status === "PAID" && !outcome.refundRequired) {
    if (outcome.trackingCode) redirect(`/${tenantSlug}/my-booking?code=${encodeURIComponent(outcome.trackingCode)}`);
    redirect(`/${tenantSlug}/account`);
  }

  const message =
    outcome.status === "PAID"
      ? "Your payment was received, but the time slot was released before it completed. The studio will contact you to arrange a refund or a new time."
      : outcome.status === "MISMATCH"
        ? "We received a payment that does not match this invoice. The studio has been flagged to review it."
        : "We have not received confirmation of your payment yet. If you completed it, this can take a minute.";

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex items-center justify-center px-4">
      <div role="status" className="max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold">Payment status</h1>
        <p className="text-sm text-zinc-300">{message}</p>
        <div className="flex justify-center gap-3 text-sm">
          {outcome.status === "NOT_PAID" && (
            <Link className="underline" href={`/${tenantSlug}/checkout/payment-return?billcode=${encodeURIComponent(billcode)}`}>
              Check again
            </Link>
          )}
          <Link className="underline" href={`/${tenantSlug}/my-booking`}>
            My booking
          </Link>
        </div>
      </div>
    </div>
  );
}

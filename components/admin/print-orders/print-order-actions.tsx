"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelPrintOrder, updatePrintOrderStatus } from "@/lib/actions/print-orders";
import { nextPrintOrderStatuses } from "@/lib/prints/status";
import { SENT_ORDER_STATUSES } from "@/lib/prints/orders";
import type { UpdateOrderStatusInput } from "@/lib/validations/print-orders";

interface PrintOrderActionsProps {
  tenantId: string;
  tenantSlug: string;
  orderId: string;
  status: string;
  fulfilment: string;
  /** The order's invoice is paid: cancelling keeps the money, so the refund happens outside the app. */
  paid: boolean;
  /** The order has an invoice (an order of only free included prints has none). */
  hasInvoice: boolean;
  /** The viewer is the studio owner: only the owner cancels an order that has an invoice (money rule). */
  isOwner: boolean;
}

const MOVE_LABELS: Record<string, string> = {
  IN_PRODUCTION: "Start production",
  READY_FOR_PICKUP: "Mark ready for pickup",
  SHIPPED: "Mark shipped",
  COLLECTED: "Mark collected",
  DELIVERED: "Mark delivered",
};

const field =
  "w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500";

/** Move the order along, add courier and tracking when it ships, or cancel it (confirmed in place). */
export function PrintOrderActions({ tenantId, tenantSlug, orderId, status, fulfilment, paid, hasInvoice, isOwner }: PrintOrderActionsProps) {
  const router = useRouter();
  const [courier, setCourier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const moves = nextPrintOrderStatuses(fulfilment, status);
  const cancellable = status !== "CANCELLED" && !SENT_ORDER_STATUSES.includes(status);
  if (moves.length === 0 && !cancellable) return null;

  const run = (fn: () => Promise<{ success: boolean; message?: string }>, done: string) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.success) {
        setError(res.message ?? "Something went wrong.");
        return;
      }
      toast.success(done);
      setConfirmCancel(false);
      router.refresh();
    });

  const move = (next: string) =>
    run(
      () =>
        updatePrintOrderStatus({
          tenantId,
          tenantSlug,
          orderId,
          status: next as UpdateOrderStatusInput["status"],
          ...(next === "SHIPPED" ? { courier, trackingNumber } : {}),
        }),
      next === "SHIPPED" ? "Marked shipped. The client has been emailed the tracking number." : next === "READY_FOR_PICKUP" ? "Marked ready. The client has been emailed." : "Order updated."
    );

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 space-y-4" aria-label="Order actions">
      <h2 className="text-sm font-semibold text-white">Next step</h2>

      {status === "AWAITING_PAYMENT" && (
        <p className="text-xs text-zinc-400">This order starts once its invoice is paid. Record the payment on the invoice.</p>
      )}

      {moves.map((next) =>
        next === "SHIPPED" ? (
          <div key={next} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] text-zinc-400">Courier</span>
                <input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="e.g. J&T Express" maxLength={100} className={field} />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-zinc-400">Tracking number</span>
                <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} maxLength={100} className={`${field} font-mono`} />
              </label>
            </div>
            <Button disabled={pending || !courier.trim() || !trackingNumber.trim()} onClick={() => move(next)}>
              {pending ? <Loader2 className="animate-spin" /> : <Truck />}
              {MOVE_LABELS[next]}
            </Button>
          </div>
        ) : (
          <Button key={next} disabled={pending} onClick={() => move(next)}>
            {pending && <Loader2 className="animate-spin" />}
            {MOVE_LABELS[next] ?? next}
          </Button>
        )
      )}

      {cancellable && hasInvoice && !isOwner && (
        <p className="pt-4 border-t border-zinc-800 text-xs text-zinc-400">Only the studio owner can cancel an order that has a payment.</p>
      )}

      {cancellable && (!hasInvoice || isOwner) && (
        <div className="pt-4 border-t border-zinc-800 space-y-3">
          {paid && (
            <p className="text-xs text-amber-300/90">
              This order is paid. Cancelling keeps its invoice paid: refund this order&apos;s payment outside the app.
            </p>
          )}
          {confirmCancel ? (
            <div className="space-y-2" role="group" aria-label="Confirm cancelling the order">
              <p className="text-xs text-zinc-300">Cancel this order? Any included prints go back to the client{hasInvoice && !paid ? " and its unpaid invoice is cancelled" : ""}.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" disabled={pending} onClick={() => run(() => cancelPrintOrder({ tenantId, tenantSlug, orderId }), "Order cancelled.")}>
                  {pending && <Loader2 className="animate-spin" />}
                  Yes, cancel order
                </Button>
                <Button variant="secondary" disabled={pending} onClick={() => setConfirmCancel(false)}>
                  Keep order
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" disabled={pending} onClick={() => setConfirmCancel(true)}>
              <Ban /> Cancel order
            </Button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Frame, Lock, Truck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cancelPrintOrder } from "@/lib/actions/print-orders";
import { errorMessageOf } from "@/lib/action-error";
import { PRINT_ORDER_STATUS_STYLES, printOrderStatusLabel } from "@/lib/prints/status";
import type { FramedPrintLine, FramedPrintOrder } from "@/lib/prints/gallery";

interface FramedPrintsSectionProps {
  tenantId: string;
  tenantSlug: string;
  /** Currency symbol, e.g. "RM". */
  currency: string;
  projectId: string;
  lines: FramedPrintLine[];
  /** The project's balance is paid, so prints can be claimed and ordered. */
  unlocked: boolean;
  hasPhotos: boolean;
  orders: FramedPrintOrder[];
  /** Tighter layout for the account Galleries card. */
  compact?: boolean;
}

const formatMoney = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** A gallery's framed prints: what the package includes, ordering, and past print orders. */
export function FramedPrintsSection({ tenantId, tenantSlug, currency, projectId, lines, unlocked, hasPhotos, orders, compact }: FramedPrintsSectionProps) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const includedCount = lines.reduce((n, l) => n + l.quantity, 0);
  const canOrder = unlocked && hasPhotos;
  const wallArtHref = `/${tenantSlug}/visualizer?projectId=${projectId}`;
  const lockedMessage = !unlocked
    ? includedCount > 0
      ? `${includedCount} framed print${includedCount === 1 ? "" : "s"} included, unlocks when your balance is paid`
      : "Framed prints unlock when your balance is paid"
    : !hasPhotos
      ? "Ask the studio to add your photos here to choose one"
      : null;

  const cancel = async (order: FramedPrintOrder) => {
    const ok = await confirm({
      title: `Cancel order ${order.orderNumber}?`,
      message: "Any included prints on it become available again.",
      confirmLabel: "Cancel order",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(order.id);
    setError(null);
    try {
      const res = await cancelPrintOrder({ tenantId, tenantSlug, orderId: order.id });
      if (!res.success) setError(res.message);
      else router.refresh();
    } catch (err) {
      setError(errorMessageOf(err) || "Couldn't cancel this order.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-labelledby={`framed-prints-${projectId}`}
      className={cn("rounded-2xl border border-zinc-800 bg-[#121215] space-y-4", compact ? "p-4" : "p-5 sm:p-6")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`framed-prints-${projectId}`} className="text-sm font-bold text-white flex items-center gap-2">
          <Frame className="size-4 text-amber-400" />
          Framed prints
        </h2>
        {canOrder ? (
          <Link href={wallArtHref} className={buttonVariants({ size: compact ? "sm" : "md" })}>
            Order a framed print
          </Link>
        ) : (
          <button type="button" disabled title={lockedMessage ?? undefined} className={buttonVariants({ size: compact ? "sm" : "md" })}>
            <Lock className="size-3.5" />
            Order a framed print
          </button>
        )}
      </div>

      {lockedMessage && (
        <p className="flex items-center gap-2 text-xs text-amber-300/90">
          <Lock className="size-3.5 shrink-0" />
          {lockedMessage}
        </p>
      )}

      {lines.length > 0 && (
        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2.5">
              <div className="text-sm text-zinc-200">
                {l.sizeName} · {l.frameName}
                <span className="ml-2 text-xs font-mono text-zinc-400">
                  {l.remaining} of {l.quantity} left
                </span>
              </div>
              {canOrder && l.remaining > 0 && (
                <Link href={`${wallArtHref}&claim=${l.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Choose photo
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {orders.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Your print orders</div>
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {o.thumbnails.length > 0 && (
                      <div className="flex -space-x-2">
                        {o.thumbnails.map((src, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={src} alt="" className="size-9 rounded-md border border-zinc-800 object-cover" />
                        ))}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white font-mono">{o.orderNumber}</div>
                      <div className="text-xs text-zinc-400">
                        {o.itemCount} print{o.itemCount === 1 ? "" : "s"} · {o.fulfilment === "SHIP" ? "Shipping" : "Pickup"} ·{" "}
                        {o.totalAmount > 0 ? `${currency} ${formatMoney(o.totalAmount)}` : "Free"}
                      </div>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-wide uppercase border",
                      PRINT_ORDER_STATUS_STYLES[o.status] ?? "bg-zinc-800 text-zinc-300 border-zinc-700"
                    )}
                  >
                    {printOrderStatusLabel(o.status)}
                  </span>
                </div>

                {o.status === "SHIPPED" && (o.courier || o.trackingNumber) && (
                  <p className="flex items-center gap-1.5 text-xs text-zinc-300">
                    <Truck className="size-3.5 text-emerald-400" />
                    {o.courier ?? "Courier"}
                    {o.trackingNumber && (
                      <>
                        {" · "}
                        <span className="font-mono text-white">{o.trackingNumber}</span>
                      </>
                    )}
                  </p>
                )}

                {o.status === "AWAITING_PAYMENT" && (
                  <div className="flex flex-wrap gap-2">
                    {o.invoiceId && (
                      <Link href={`/${tenantSlug}/checkout?invoiceId=${o.invoiceId}`} className={buttonVariants({ size: "sm" })}>
                        <CreditCard className="size-3.5" />
                        Pay
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => cancel(o)}
                      disabled={busyId === o.id}
                      className={buttonVariants({ variant: "danger", size: "sm" })}
                    >
                      <X className="size-3.5" />
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}
      {confirmDialog}
    </section>
  );
}

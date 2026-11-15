"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ShoppingBag, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useDialog } from "@/lib/use-dialog";
import { CheckoutStep } from "./checkout-step";
import { priceLabel, priceLine, type CartLine, type Catalog, type OrderingContext } from "./cart";

const MAT_LABELS: Record<string, string> = {
  NONE: "No mat",
  WHITE_2INCH: '2" white mat',
  OFFWHITE_2INCH: '2" off-white mat',
};

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  currency: string;
  ordering: OrderingContext;
  cart: CartLine[];
  catalog: Catalog;
  onRemove: (key: string) => void;
  /** Empties the cart once its order is placed. */
  onOrdered: () => void;
}

export function CartDrawer({ open, onClose, tenantId, tenantSlug, currency, ordering, cart, catalog, onRemove, onOrdered }: CartDrawerProps) {
  const dialog = useDialog(open, onClose);
  const [step, setStep] = useState<"cart" | "checkout">("cart");
  const [placed, setPlaced] = useState<string | null>(null);

  if (!open) return null;

  const close = () => {
    // A finished order starts the next visit from the cart, not the confirmation.
    if (placed) {
      setPlaced(null);
      setStep("cart");
    }
    onClose();
  };

  const handlePlaced = ({ orderNumber, checkoutUrl }: { orderNumber: string; checkoutUrl: string | null }) => {
    onOrdered();
    if (checkoutUrl) {
      window.location.assign(checkoutUrl);
      return;
    }
    setPlaced(orderNumber);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in-0" onClick={close}>
      <div
        {...dialog}
        aria-labelledby="cart-drawer-title"
        onClick={(e) => e.stopPropagation()}
        className="relative h-full w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-[#0d0d10] p-5 sm:p-6 shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-zinc-800">
          <h2 id="cart-drawer-title" className="text-lg font-bold text-white flex items-center gap-2">
            <ShoppingBag className="size-5 text-amber-400" />
            {placed ? "Order placed" : step === "checkout" ? "Checkout" : `Your prints (${cart.length})`}
          </h2>
          <button type="button" onClick={close} aria-label="Close" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <X className="size-4" />
          </button>
        </div>

        {placed ? (
          <div className="space-y-4 text-center py-6">
            <CheckCircle2 className="size-10 text-emerald-400 mx-auto" />
            <div>
              <p className="text-base font-semibold text-white">Order placed</p>
              <p className="text-sm text-zinc-400 mt-1">
                Order number <span className="font-mono text-white">{placed}</span>. The studio will let you know when your prints are ready.
              </p>
            </div>
            <Link href={ordering.galleryHref} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
              Back to your gallery
            </Link>
          </div>
        ) : step === "checkout" ? (
          <CheckoutStep
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            currency={currency}
            ordering={ordering}
            cart={cart}
            catalog={catalog}
            onBack={() => setStep("cart")}
            onPlaced={handlePlaced}
          />
        ) : cart.length === 0 ? (
          <p className="text-sm text-zinc-400 py-8 text-center">Your cart is empty. Choose a photo, size and frame, then add it here.</p>
        ) : (
          <>
            <ul className="space-y-3">
              {cart.map((line) => {
                const priced = priceLine(line, catalog);
                const size = catalog.sizes.get(line.printSizeId);
                const frame = catalog.frames.get(line.frameDesignId);
                return (
                  <li key={line.key} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                    <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={line.photoUrl} alt={line.photoTitle} className="size-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-semibold text-white truncate">{line.photoTitle}</p>
                      <p className="text-xs text-zinc-400">
                        {size?.name ?? "Size unavailable"} · {frame?.name ?? "Frame unavailable"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {MAT_LABELS[line.matBoardType]} · {line.orientation === "PORTRAIT" ? "Portrait" : "Landscape"}
                      </p>
                      <p className={cn("text-xs font-mono font-semibold", line.kind === "INCLUDED" ? "text-emerald-400" : "text-white")}>
                        {priceLabel(line, priced, currency)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(line.key)}
                      aria-label={`Remove ${line.photoTitle}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-start")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => setStep("checkout")}
              disabled={cart.some((l) => !priceLine(l, catalog))}
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              Checkout
            </button>
            {cart.some((l) => !priceLine(l, catalog)) && (
              <p className="text-xs text-amber-400">Remove the prints marked unavailable to continue.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

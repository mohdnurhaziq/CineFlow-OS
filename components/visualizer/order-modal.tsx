"use client";

import { useState } from "react";
import Link from "next/link";
import {
  X,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import { createPrintOrder } from "@/lib/actions/visualizer";
import type { PrintSizeOption, FrameDesignOption, PhotoOption } from "./configurator-panel";
import { useDialog } from "@/lib/use-dialog";

/** A client orders for themselves; studio staff order on a client's behalf. */
export type PrintOrderer = { kind: "client" | "staff"; name: string; email: string; phone: string };

interface OrderModalProps {
  orderer: PrintOrderer | null;
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  projectId?: string | null;
  currency: string;
  selectedPhoto: PhotoOption;
  selectedPrintSize: PrintSizeOption;
  selectedFrameDesign: FrameDesignOption;
  matBoard: "NONE" | "WHITE_2INCH" | "OFFWHITE_2INCH";
  orientation: "PORTRAIT" | "LANDSCAPE";
  totalPrice: number;
}

export function OrderModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  projectId,
  orderer,
  currency,
  selectedPhoto,
  selectedPrintSize,
  selectedFrameDesign,
  matBoard,
  orientation,
  totalPrice,
}: OrderModalProps) {
  const isClient = orderer?.kind === "client";
  const [clientName, setClientName] = useState(isClient ? orderer.name : "");
  const [clientEmail, setClientEmail] = useState(isClient ? orderer.email : "");
  const [clientPhone, setClientPhone] = useState(isClient ? orderer.phone : "");
  const [notes, setNotes] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dialog = useDialog(isOpen, onClose);
  if (!isOpen) return null;

  const matPrice = matBoard === "NONE" ? 0 : 25.0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (!clientName.trim()) {
        setErrorMessage("Client name is required.");
        setIsSubmitting(false);
        return;
      }
      if (!clientEmail.trim() || !clientEmail.includes("@")) {
        setErrorMessage("Valid client email is required.");
        setIsSubmitting(false);
        return;
      }

      const res = await createPrintOrder({
        tenantId,
        tenantSlug,
        projectId: projectId || null,
        printSizeId: selectedPrintSize.id,
        frameDesignId: selectedFrameDesign.id,
        matBoardType: matBoard,
        orientation,
        photoUrl: selectedPhoto.url,
        photoTitle: selectedPhoto.title,
        clientName,
        clientEmail,
        clientPhone: clientPhone || null,
        notes: notes || null,
      });

      if (res.success && res.checkoutUrl) {
        // Instant redirect to CineFlow OS multi-option checkout
        window.location.href = res.checkoutUrl;
      } else {
        setErrorMessage(res.message || "Failed to create print order.");
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in-0">
      <div {...dialog} aria-labelledby="order-modal-title" className="relative w-full max-w-lg rounded-3xl border border-zinc-800 bg-[#0d0d10] p-6 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400 font-bold mb-1">
              <ShoppingBag className="size-4" />
              <span>1-CLICK PRINT & FRAME WORK ORDER</span>
            </div>
            <h3 id="order-modal-title" className="text-xl font-extrabold text-white tracking-tight">
              Confirm Archival Wall Art Order
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Generates official milestone invoice and connects to studio checkout
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Itemized Financial Schedule */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-2.5 text-xs font-mono">
          <div className="flex items-center justify-between text-zinc-300">
            <span>
              Archival Print ({selectedPrintSize.name} · {orientation})
            </span>
            <span className="font-bold text-white">
              {currency} {selectedPrintSize.basePrice.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-between text-zinc-300">
            <span>
              Custom Frame Molding ({selectedFrameDesign.name})
            </span>
            <span className="font-bold text-amber-400">
              +{currency} {selectedFrameDesign.priceOffset.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-between text-zinc-300">
            <span>
              Museum Mat Board ({matBoard.replace(/_/g, " ")})
            </span>
            <span className="font-bold text-zinc-400">
              +{currency} {matPrice.toFixed(2)}
            </span>
          </div>

          <div className="pt-2.5 border-t border-zinc-800 flex items-center justify-between text-sm">
            <span className="font-bold text-white uppercase tracking-wider">
              Total Order Settlement:
            </span>
            <span className="font-extrabold text-emerald-400 text-lg">
              {currency} {totalPrice.toFixed(2)}
            </span>
          </div>
        </div>

        {!orderer ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3 text-sm">
            <p className="text-white font-semibold">Sign in to place your order</p>
            <p className="text-xs text-zinc-400">
              Orders are billed to your client account, so you can track and pay them from My Account.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/${tenantSlug}/login?callbackUrl=${encodeURIComponent(
                  typeof window !== "undefined" ? window.location.pathname + window.location.search : `/${tenantSlug}/visualizer`
                )}`}
                className="inline-flex items-center justify-center min-h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors"
              >
                Sign in
              </Link>
              <Link
                href={`/${tenantSlug}/register?next=${encodeURIComponent(
                  typeof window !== "undefined" ? window.location.pathname + window.location.search : `/${tenantSlug}/visualizer`
                )}`}
                className="inline-flex items-center justify-center min-h-11 px-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:text-white text-xs font-semibold transition-colors"
              >
                Create an account
              </Link>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {isClient && (
            <p className="text-xs text-zinc-400">
              Ordering as <span className="text-white font-semibold">{orderer.name}</span> ({orderer.email}).
            </p>
          )}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!isClient && (
          <>
          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Recipient / Client Legal Name *
            </label>
            <input
              type="text"
              required
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Jessica Montgomery"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Client Email *
              </label>
              <input
                type="email"
                required
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="jessica@client.com"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Phone Number (Optional)
              </label>
              <input
                type="tel"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="+1 (555) 019-2831"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          </>
          )}

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Framing & Delivery Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Include hanging wire kit; ship to residential address."
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 pt-1">
            <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
            <span>Multi-mode checkout: Card instant payment, Studio QR, or Cash counter</span>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white text-xs font-mono transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-extrabold transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CreditCard className="size-4" />
              <span>
                {isSubmitting ? "Generating Invoice..." : `Proceed to Checkout (${currency} ${totalPrice.toFixed(2)})`}
              </span>
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

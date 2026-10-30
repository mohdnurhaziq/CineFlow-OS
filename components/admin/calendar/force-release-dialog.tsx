"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { forceReleaseHeldSlot } from "@/lib/actions/admin-calendar";
import type { BookingSlotRow } from "./single-slot-dialog";

interface ForceReleaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  slot: BookingSlotRow | null;
  onSuccess?: () => void;
}

export function ForceReleaseDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  slot,
  onSuccess,
}: ForceReleaseDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !slot) return null;

  const dateStr = new Date(slot.date).toISOString().split("T")[0];

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await forceReleaseHeldSlot({
        slotId: slot.id,
        tenantId,
        tenantSlug,
      });

      if (!res.success) {
        setErrorMessage(res.message || "Failed to force release slot.");
        setIsSubmitting(false);
        return;
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-0">
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0d0d10] p-6 shadow-2xl">
        <div className="flex items-center gap-3 pb-3 border-b border-zinc-800">
          <div className="size-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Force Release Held Slot
            </h3>
            <p className="text-xs text-zinc-400">
              Clear active reservation lease
            </p>
          </div>
        </div>

        <div className="py-4 space-y-3">
          <p className="text-xs text-zinc-300">
            This slot is currently <strong className="text-amber-400">HELD</strong> for checkout:
          </p>

          <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-zinc-500">Date:</span>
              <span className="text-white">{dateStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Time:</span>
              <span className="text-white">{slot.startTime} – {slot.endTime}</span>
            </div>
            {slot.heldBySessionId && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Session:</span>
                <span className="text-zinc-400 truncate max-w-[200px]">{slot.heldBySessionId}</span>
              </div>
            )}
          </div>

          <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
            Releasing will immediately return this slot to <strong>AVAILABLE</strong>, allowing other clients to book it. Any in-flight checkout for this lease will fail to finalize.
          </p>

          {errorMessage && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Releasing...</span>
              </>
            ) : (
              <span>Confirm Release</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

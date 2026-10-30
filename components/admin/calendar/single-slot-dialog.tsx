"use client";

import { useState, useEffect } from "react";
import { X, Plus, Edit2, AlertCircle, Loader2, Calendar } from "lucide-react";
import { createSingleBookingSlot, updateBookingSlot } from "@/lib/actions/admin-calendar";

export interface BookingSlotRow {
  id: string;
  category: string;
  campaignTitle?: string | null;
  date: Date | string;
  startTime: string;
  endTime: string;
  status: string;
  heldUntil?: Date | string | null;
  heldBySessionId?: string | null;
  price: number;
  depositRequired: number;
  booking?: {
    id: string;
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    trackingCode: string;
    status: string;
  } | null;
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  badgeIcon?: string | null;
}

interface SingleSlotDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  currency: string;
  categories: CategoryOption[];
  slotToEdit?: BookingSlotRow | null;
  onSuccess?: () => void;
}

export function SingleSlotDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  currency,
  categories,
  slotToEdit,
  onSuccess,
}: SingleSlotDialogProps) {
  const isEditing = !!slotToEdit;

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00 AM");
  const [endTime, setEndTime] = useState("11:30 AM");
  const [category, setCategory] = useState(categories[0]?.slug || "STUDIO_PORTRAIT");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [price, setPrice] = useState("0");
  const [depositRequired, setDepositRequired] = useState("50");
  const [status, setStatus] = useState<"AVAILABLE" | "BLOCKED">("AVAILABLE");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (slotToEdit) {
      const d = new Date(slotToEdit.date);
      setDate(d.toISOString().split("T")[0] || "");
      setStartTime(slotToEdit.startTime);
      setEndTime(slotToEdit.endTime);
      setCategory(slotToEdit.category);
      setCampaignTitle(slotToEdit.campaignTitle || "");
      setPrice(slotToEdit.price.toString());
      setDepositRequired(slotToEdit.depositRequired.toString());
      setStatus(slotToEdit.status === "BLOCKED" ? "BLOCKED" : "AVAILABLE");
    } else {
      // Default to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDate(tomorrow.toISOString().split("T")[0] || "");
      setStartTime("10:00 AM");
      setEndTime("11:30 AM");
      setCategory(categories[0]?.slug || "STUDIO_PORTRAIT");
      setCampaignTitle("");
      setPrice("0");
      setDepositRequired("50");
      setStatus("AVAILABLE");
    }
    setErrorMessage(null);
  }, [slotToEdit, categories, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const parsedPrice = parseFloat(price);
    const parsedDeposit = parseFloat(depositRequired);

    try {
      if (isEditing && slotToEdit) {
        const res = await updateBookingSlot({
          id: slotToEdit.id,
          tenantId,
          tenantSlug,
          date,
          startTime,
          endTime,
          category,
          campaignTitle: campaignTitle || null,
          price: isNaN(parsedPrice) ? 0 : parsedPrice,
          depositRequired: isNaN(parsedDeposit) ? 50 : parsedDeposit,
          status,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to update slot.");
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createSingleBookingSlot({
          tenantId,
          tenantSlug,
          date,
          startTime,
          endTime,
          category,
          campaignTitle: campaignTitle || null,
          price: isNaN(parsedPrice) ? 0 : parsedPrice,
          depositRequired: isNaN(parsedDeposit) ? 50 : parsedDeposit,
          status,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to create slot.");
          setIsSubmitting(false);
          return;
        }
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
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#0d0d10] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              {isEditing ? <Edit2 className="size-4 text-amber-400" /> : <Plus className="size-4 text-amber-400" />}
              <span>{isEditing ? "Edit Booking Slot" : "Create Single Booking Slot"}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Specify session date, operating hours, and baseline session fee
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Session Date *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Start Time * (e.g. 10:00 AM)
              </label>
              <input
                type="text"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="10:00 AM"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                End Time * (e.g. 11:30 AM)
              </label>
              <input
                type="text"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="11:30 AM"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.badgeIcon ? `${c.badgeIcon} ` : ""}{c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Campaign Title (Optional)
              </label>
              <input
                type="text"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                placeholder="e.g. Golden Hour Session"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Slot Fee ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Deposit Required ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={depositRequired}
                onChange={(e) => setDepositRequired(e.target.value)}
                placeholder="50"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Initial Availability Status
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="slotStatus"
                  value="AVAILABLE"
                  checked={status === "AVAILABLE"}
                  onChange={() => setStatus("AVAILABLE")}
                  className="text-amber-500 focus:ring-0"
                />
                <span className="text-xs text-white">Available for Booking</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="slotStatus"
                  value="BLOCKED"
                  checked={status === "BLOCKED"}
                  onChange={() => setStatus("BLOCKED")}
                  className="text-amber-500 focus:ring-0"
                />
                <span className="text-xs text-zinc-400">Blocked / Maintenance</span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
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
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isEditing ? "Update Slot" : "Create Slot"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

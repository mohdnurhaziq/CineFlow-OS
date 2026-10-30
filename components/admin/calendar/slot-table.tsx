"use client";

import { useState } from "react";
import {
  Clock,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
  User,
  Phone,
  Mail,
  Loader2,
  CheckCircle,
} from "lucide-react";
import {
  deleteBookingSlot,
  toggleBlockBookingSlot,
  batchDeleteBookingSlots,
} from "@/lib/actions/admin-calendar";
import type { BookingSlotRow, CategoryOption } from "./single-slot-dialog";

interface SlotTableProps {
  slots: BookingSlotRow[];
  tenantId: string;
  tenantSlug: string;
  currency: string;
  categories: CategoryOption[];
  onEdit: (slot: BookingSlotRow) => void;
  onForceRelease: (slot: BookingSlotRow) => void;
  onSuccess: () => void;
}

export function SlotTable({
  slots,
  tenantId,
  tenantSlug,
  currency,
  categories,
  onEdit,
  onForceRelease,
  onSuccess,
}: SlotTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [togglingBlockId, setTogglingBlockId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === slots.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(slots.map((s) => s.id));
    }
  };

  const handleDelete = async (slot: BookingSlotRow) => {
    if (!confirm(`Delete slot on ${new Date(slot.date).toISOString().split("T")[0]} at ${slot.startTime}?`)) return;

    setDeletingId(slot.id);
    setErrorMessage(null);

    try {
      const res = await deleteBookingSlot({
        slotId: slot.id,
        tenantId,
        tenantSlug,
      });

      if (!res.success) {
        setErrorMessage(res.message || "Failed to delete slot.");
      } else {
        setSelectedIds(selectedIds.filter((id) => id !== slot.id));
        onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected slot(s)? (Booked slots will be skipped)`)) return;

    setIsBatchDeleting(true);
    setErrorMessage(null);

    try {
      const res = await batchDeleteBookingSlots({
        tenantId,
        tenantSlug,
        slotIds: selectedIds,
      });

      if (!res.success) {
        setErrorMessage(res.message || "Failed to batch delete slots.");
      } else {
        setSelectedIds([]);
        onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const handleToggleBlock = async (slot: BookingSlotRow) => {
    setTogglingBlockId(slot.id);
    setErrorMessage(null);

    try {
      const res = await toggleBlockBookingSlot({
        slotId: slot.id,
        tenantId,
        tenantSlug,
      });

      if (!res.success) {
        setErrorMessage(res.message || "Failed to toggle block status.");
      } else {
        onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setTogglingBlockId(null);
    }
  };

  const formatPrice = (val: number) => {
    return `${currency === "MYR" ? "RM" : "$"}${val.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  };

  if (slots.length === 0) {
    return (
      <div className="p-8 text-center rounded-2xl border border-zinc-800 bg-[#0d0d10]">
        <p className="text-sm text-zinc-400">No calendar booking slots found matching filters.</p>
        <p className="text-xs text-zinc-400 mt-1">Use "New Slot" or "Batch Generate" to populate studio availability.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {errorMessage}
        </div>
      )}

      {/* Batch Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between animate-in fade-in-0">
          <span className="text-xs font-mono text-amber-300">
            {selectedIds.length} slot(s) selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={isBatchDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              {isBatchDeleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              <span>Delete Selected</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs font-mono text-zinc-400 hover:text-white px-2 py-1"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="text-[11px] font-mono uppercase bg-zinc-900/60 text-zinc-400 border-b border-zinc-800">
              <tr>
                <th scope="col" className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === slots.length && slots.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-0"
                  />
                </th>
                <th scope="col" className="px-4 py-3">Date & Time</th>
                <th scope="col" className="px-4 py-3">Category</th>
                <th scope="col" className="px-4 py-3">Pricing</th>
                <th scope="col" className="px-4 py-3">Status / Booking Info</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
              {slots.map((slot) => {
                const dateStr = new Date(slot.date).toISOString().split("T")[0];
                const categoryObj = categories.find((c) => c.slug === slot.category);
                const isSelected = selectedIds.includes(slot.id);

                return (
                  <tr
                    key={slot.id}
                    className={`hover:bg-zinc-900/30 transition-colors ${
                      isSelected ? "bg-amber-500/5" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(slot.id)}
                        className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-0"
                      />
                    </td>

                    {/* Date & Time */}
                    <td className="px-4 py-3 font-sans">
                      <div className="font-bold text-white text-xs">{dateStr}</div>
                      <div className="text-[11px] font-mono text-zinc-400 mt-0.5 flex items-center gap-1">
                        <Clock className="size-3 text-amber-400" />
                        {slot.startTime} – {slot.endTime}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 font-sans">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {categoryObj?.badgeIcon ? `${categoryObj.badgeIcon} ` : ""}
                        {categoryObj?.name || slot.category}
                      </span>
                      {slot.campaignTitle && (
                        <div className="text-[11px] text-zinc-400 mt-1 truncate max-w-[150px]">
                          {slot.campaignTitle}
                        </div>
                      )}
                    </td>

                    {/* Pricing */}
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{formatPrice(slot.price)}</div>
                      <div className="text-[10px] text-zinc-500">
                        Dep: {formatPrice(slot.depositRequired)}
                      </div>
                    </td>

                    {/* Status Pill & Details */}
                    <td className="px-4 py-3 font-sans">
                      {slot.status === "AVAILABLE" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle className="size-3" /> Available
                        </span>
                      )}

                      {slot.status === "HELD" && (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                            <Clock className="size-3" /> Held in Checkout
                          </span>
                          <button
                            type="button"
                            onClick={() => onForceRelease(slot)}
                            className="block text-[10px] font-mono text-amber-400 hover:underline"
                          >
                            Force release hold
                          </button>
                        </div>
                      )}

                      {slot.status === "PENDING_VERIFICATION" && (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Verification Pending
                          </span>
                          {slot.booking && (
                            <div className="text-[11px] text-zinc-300 flex items-center gap-1">
                              <User className="size-3 text-zinc-500" />
                              <span>{slot.booking.clientName}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {slot.status === "BOOKED" && (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            Booked Session
                          </span>
                          {slot.booking && (
                            <div className="text-[11px] text-zinc-300 font-medium">
                              {slot.booking.clientName}
                            </div>
                          )}
                        </div>
                      )}

                      {slot.status === "BLOCKED" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                          <Lock className="size-3" /> Blocked / Blackout
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Toggle block/unblock for AVAILABLE and BLOCKED */}
                        {(slot.status === "AVAILABLE" || slot.status === "BLOCKED") && (
                          <button
                            type="button"
                            onClick={() => handleToggleBlock(slot)}
                            disabled={togglingBlockId === slot.id}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            title={slot.status === "BLOCKED" ? "Unblock Slot" : "Block Slot"}
                          >
                            {togglingBlockId === slot.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : slot.status === "BLOCKED" ? (
                              <Unlock className="size-3.5 text-amber-400" />
                            ) : (
                              <Lock className="size-3.5" />
                            )}
                          </button>
                        )}

                        {/* Force release if held */}
                        {slot.status === "HELD" && (
                          <button
                            type="button"
                            onClick={() => onForceRelease(slot)}
                            className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/20 transition-colors"
                            title="Force Release Hold"
                          >
                            <AlertTriangle className="size-3.5" />
                          </button>
                        )}

                        {/* Edit Slot (disabled if booked) */}
                        <button
                          type="button"
                          onClick={() => onEdit(slot)}
                          disabled={slot.status === "BOOKED"}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
                          title="Edit Slot"
                        >
                          <Edit2 className="size-3.5" />
                        </button>

                        {/* Delete Slot (disabled if booked) */}
                        <button
                          type="button"
                          onClick={() => handleDelete(slot)}
                          disabled={
                            deletingId === slot.id ||
                            slot.status === "BOOKED" ||
                            slot.status === "PENDING_VERIFICATION"
                          }
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                          title="Delete Slot"
                        >
                          {deletingId === slot.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

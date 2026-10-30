"use client";

import { useState } from "react";
import { X, Plus, Trash2, PackagePlus, AlertCircle } from "lucide-react";
import { createKitBundle, updateKitBundle } from "@/lib/actions/gear";
import type { InventoryItemRow } from "./gear-item-dialog";

export interface KitBundleRow {
  id: string;
  name: string;
  description: string;
  discipline: string;
  dailyRate?: number | null;
  items: Array<{
    id: string;
    itemId: string;
    quantity: number;
    item: InventoryItemRow;
  }>;
}

interface KitBundleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  availableItems: InventoryItemRow[];
  bundleToEdit?: KitBundleRow | null;
  onSuccess?: () => void;
}

export function KitBundleDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  availableItems,
  bundleToEdit,
  onSuccess,
}: KitBundleDialogProps) {
  const isEditing = !!bundleToEdit;

  const [name, setName] = useState(bundleToEdit?.name || "");
  const [description, setDescription] = useState(bundleToEdit?.description || "");
  const [discipline, setDiscipline] = useState<"PHOTOGRAPHY" | "VIDEOGRAPHY" | "HYBRID">(
    (bundleToEdit?.discipline as any) || "VIDEOGRAPHY"
  );
  const [dailyRate, setDailyRate] = useState<string>(
    bundleToEdit?.dailyRate !== undefined && bundleToEdit?.dailyRate !== null
      ? String(bundleToEdit.dailyRate)
      : ""
  );

  const [selectedItems, setSelectedItems] = useState<Array<{ itemId: string; quantity: number }>>(
    bundleToEdit?.items.map((i) => ({ itemId: i.itemId, quantity: i.quantity })) || [
      { itemId: availableItems[0]?.id || "", quantity: 1 },
    ]
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAddItemRow = () => {
    if (availableItems.length === 0) return;
    setSelectedItems((prev) => [...prev, { itemId: availableItems[0]?.id || "", quantity: 1 }]);
  };

  const handleRemoveItemRow = (index: number) => {
    setSelectedItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, itemId: string) => {
    setSelectedItems((prev) => {
      const copy = [...prev];
      if (copy[index]) copy[index].itemId = itemId;
      return copy;
    });
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    setSelectedItems((prev) => {
      const copy = [...prev];
      if (copy[index]) copy[index].quantity = Math.max(1, quantity);
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (selectedItems.length === 0) {
        setErrorMessage("Please add at least one gear item to this kit bundle.");
        setIsSubmitting(false);
        return;
      }

      const parsedRate = dailyRate ? parseFloat(dailyRate) : null;

      if (isEditing && bundleToEdit) {
        const res = await updateKitBundle({
          id: bundleToEdit.id,
          tenantId,
          tenantSlug,
          name,
          description,
          discipline,
          dailyRate: parsedRate,
          items: selectedItems,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to update kit bundle.");
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createKitBundle({
          tenantId,
          tenantSlug,
          name,
          description,
          discipline,
          dailyRate: parsedRate,
          items: selectedItems,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to create kit bundle.");
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
      <div className="relative w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#0d0d10] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <PackagePlus className="size-4 text-amber-400" />
              <span>{isEditing ? "Edit Kit Bundle (BOM)" : "Create Equipment Kit Bundle (BOM)"}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Define reusable gear recipes with bill of materials verification
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

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Bundle Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cinema A-Cam Package (ARRI LF)"
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Description / Shoot Utility *
            </label>
            <textarea
              required
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Primary narrative A-camera package with prime zoom and 4-axis stabilization"
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Discipline
              </label>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="VIDEOGRAPHY">VIDEOGRAPHY</option>
                <option value="PHOTOGRAPHY">PHOTOGRAPHY</option>
                <option value="HYBRID">HYBRID</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Daily Package Rate ($/RM)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                placeholder="1500"
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Constituent BOM Items List */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">
                Constituent Bill of Materials (BOM)
              </label>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="inline-flex items-center gap-1 text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors"
              >
                <Plus className="size-3" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {selectedItems.map((row, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900/80 border border-zinc-800"
                >
                  <select
                    value={row.itemId}
                    onChange={(e) => handleItemChange(idx, e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    {availableItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.sku}) [{item.status}]
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1 text-xs font-mono text-zinc-400">
                    <span>Qty:</span>
                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 1)}
                      className="w-14 px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-white text-center font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveItemRow(idx)}
                    disabled={selectedItems.length <= 1}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-30"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white text-xs font-mono transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : isEditing ? "Save Bundle" : "Assemble Kit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

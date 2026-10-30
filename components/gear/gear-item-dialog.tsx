"use client";

import { useState } from "react";
import { X, Plus, Edit2, AlertCircle } from "lucide-react";
import { createGearItem, updateGearItem } from "@/lib/actions/gear";

export interface InventoryItemRow {
  id: string;
  name: string;
  sku: string;
  serialNumber?: string | null;
  discipline: string;
  category: string;
  condition: string;
  status: string;
  dailyRate?: number | null;
  location?: string | null;
}

interface GearItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  itemToEdit?: InventoryItemRow | null;
  onSuccess?: () => void;
}

const CATEGORIES = [
  "Cameras",
  "Lenses",
  "Lighting",
  "Audio",
  "Support",
  "Drones",
  "Grip",
  "Accessories",
];

const DISCIPLINES = ["PHOTOGRAPHY", "VIDEOGRAPHY", "UNIVERSAL"];
const CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "MAINTENANCE_NEEDED", "DAMAGED"];
const STATUSES = ["AVAILABLE", "ON_SHOOT", "RESERVED", "MAINTENANCE"];

export function GearItemDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  itemToEdit,
  onSuccess,
}: GearItemDialogProps) {
  const isEditing = !!itemToEdit;

  const [name, setName] = useState(itemToEdit?.name || "");
  const [sku, setSku] = useState(itemToEdit?.sku || "");
  const [serialNumber, setSerialNumber] = useState(itemToEdit?.serialNumber || "");
  const [category, setCategory] = useState(itemToEdit?.category || "Cameras");
  const [discipline, setDiscipline] = useState(itemToEdit?.discipline || "UNIVERSAL");
  const [condition, setCondition] = useState(itemToEdit?.condition || "EXCELLENT");
  const [status, setStatus] = useState(itemToEdit?.status || "AVAILABLE");
  const [dailyRate, setDailyRate] = useState<string>(
    itemToEdit?.dailyRate !== undefined && itemToEdit?.dailyRate !== null
      ? String(itemToEdit.dailyRate)
      : ""
  );
  const [location, setLocation] = useState(itemToEdit?.location || "Main Vault");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const parsedRate = dailyRate ? parseFloat(dailyRate) : null;

      if (isEditing && itemToEdit) {
        const res = await updateGearItem({
          id: itemToEdit.id,
          tenantId,
          tenantSlug,
          name,
          sku,
          serialNumber: serialNumber || null,
          category,
          discipline: discipline as any,
          condition: condition as any,
          status: status as any,
          dailyRate: parsedRate,
          location: location || null,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to update item.");
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createGearItem({
          tenantId,
          tenantSlug,
          name,
          sku,
          serialNumber: serialNumber || null,
          category,
          discipline: discipline as any,
          condition: condition as any,
          status: status as any,
          dailyRate: parsedRate,
          location: location || null,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to create item.");
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
              <span>{isEditing ? "Edit Equipment Asset" : "Register New Equipment Item"}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Maintain hardware serial numbers and operational availability
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
              Equipment Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ARRI Alexa Mini LF Cinema Body"
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500 font-normal"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Asset SKU *
              </label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                placeholder="CAM-ARRI-01"
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Serial Number
              </label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="ALF-29401"
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Discipline
              </label>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Condition
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {CONDITIONS.map((cond) => (
                  <option key={cond} value={cond}>
                    {cond}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Daily Rate ($/RM)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                placeholder="150"
                className="w-full px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Storage Vault / Shelf Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Shelf A-3, Camera Vault Lockbox"
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500 font-normal"
            />
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
              {isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Create Asset"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

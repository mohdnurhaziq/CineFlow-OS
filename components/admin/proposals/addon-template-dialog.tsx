"use client";

import { useState, useEffect } from "react";
import { X, Plus, Edit2, AlertCircle, Loader2, Sparkles } from "lucide-react";
import {
  createProposalAddOnTemplate,
  updateProposalAddOnTemplate,
} from "@/lib/actions/admin-proposals";

export interface ProposalAddOnTemplateRow {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string; // "fixed" | "per_hour" | "per_day"
  isDefault: boolean;
  isActive: boolean;
}

interface AddOnTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  currency: string;
  templateToEdit?: ProposalAddOnTemplateRow | null;
  onSuccess?: () => void;
}

const UNITS = [
  { label: "Fixed Flat Fee", value: "fixed" },
  { label: "Per Hour (/ hr)", value: "per_hour" },
  { label: "Per Day (/ day)", value: "per_day" },
];

export function AddOnTemplateDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  currency,
  templateToEdit,
  onSuccess,
}: AddOnTemplateDialogProps) {
  const isEditing = !!templateToEdit;

  const [name, setName] = useState(templateToEdit?.name || "");
  const [description, setDescription] = useState(templateToEdit?.description || "");
  const [price, setPrice] = useState(templateToEdit?.price?.toString() || "");
  const [unit, setUnit] = useState<"fixed" | "per_hour" | "per_day">(
    (templateToEdit?.unit as any) || "fixed"
  );
  const [isDefault, setIsDefault] = useState(templateToEdit?.isDefault || false);
  const [isActive, setIsActive] = useState(templateToEdit?.isActive ?? true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (templateToEdit) {
      setName(templateToEdit.name);
      setDescription(templateToEdit.description);
      setPrice(templateToEdit.price.toString());
      setUnit((templateToEdit.unit as any) || "fixed");
      setIsDefault(templateToEdit.isDefault);
      setIsActive(templateToEdit.isActive);
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setUnit("fixed");
      setIsDefault(false);
      setIsActive(true);
    }
    setErrorMessage(null);
  }, [templateToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setErrorMessage("Please enter a valid non-negative price.");
      setIsSubmitting(false);
      return;
    }

    try {
      if (isEditing && templateToEdit) {
        const res = await updateProposalAddOnTemplate({
          id: templateToEdit.id,
          tenantId,
          tenantSlug,
          name,
          description,
          price: parsedPrice,
          unit,
          isDefault,
          isActive,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to update template.");
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createProposalAddOnTemplate({
          tenantId,
          tenantSlug,
          name,
          description,
          price: parsedPrice,
          unit,
          isDefault,
          isActive,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to create template.");
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
              <span>{isEditing ? "Edit Proposal Add-On" : "Create Proposal Add-On Template"}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Add-ons are offered to clients in dynamic quotes and proposal contracts
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
              Add-On Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Drone 4K Aerial Coverage"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Pricing Unit *
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Price ({currency}) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="450"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Description *
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed explanation of what this option includes (e.g. FAA-certified pilot, dual battery sets, raw 10-bit log footage)..."
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors resize-none"
            />
          </div>

          {/* Default and Active Toggles */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-amber-400" />
                <div>
                  <span className="text-xs font-medium text-white block">Pre-Select by Default</span>
                  <span className="text-[11px] text-zinc-400">Automatically enabled on new client proposals</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-zinc-600 text-amber-500 focus:ring-0 size-4"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <div>
                <span className="text-xs font-medium text-white block">Active in Catalog</span>
                <span className="text-[11px] text-zinc-400">Clients can view and add this item to proposals</span>
              </div>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-zinc-600 text-amber-500 focus:ring-0 size-4"
              />
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
                <span>{isEditing ? "Update Template" : "Create Add-On"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

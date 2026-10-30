"use client";

import { useState, useEffect } from "react";
import { X, Plus, Edit2, AlertCircle, Loader2 } from "lucide-react";
import { createPrintSize, updatePrintSize } from "@/lib/actions/admin-frames";

export interface PrintSizeRow {
  id: string;
  code: string;
  name: string;
  widthInches: number;
  heightInches: number;
  basePrice: number;
}

interface PrintSizeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  currency: string;
  sizeToEdit?: PrintSizeRow | null;
  onSuccess?: () => void;
}

export function PrintSizeDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  currency,
  sizeToEdit,
  onSuccess,
}: PrintSizeDialogProps) {
  const isEditing = !!sizeToEdit;

  const [code, setCode] = useState(sizeToEdit?.code || "");
  const [name, setName] = useState(sizeToEdit?.name || "");
  const [widthInches, setWidthInches] = useState(sizeToEdit?.widthInches?.toString() || "");
  const [heightInches, setHeightInches] = useState(sizeToEdit?.heightInches?.toString() || "");
  const [basePrice, setBasePrice] = useState(sizeToEdit?.basePrice?.toString() || "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (sizeToEdit) {
      setCode(sizeToEdit.code);
      setName(sizeToEdit.name);
      setWidthInches(sizeToEdit.widthInches.toString());
      setHeightInches(sizeToEdit.heightInches.toString());
      setBasePrice(sizeToEdit.basePrice.toString());
    } else {
      setCode("");
      setName("");
      setWidthInches("");
      setHeightInches("");
      setBasePrice("");
    }
    setErrorMessage(null);
  }, [sizeToEdit, isOpen]);

  if (!isOpen) return null;

  // Auto-fill display name when dimensions change
  const handleWidthChange = (val: string) => {
    setWidthInches(val);
    if (!isEditing && code && val && heightInches) {
      setName(`${code} (${val} x ${heightInches} in)`);
    }
  };

  const handleHeightChange = (val: string) => {
    setHeightInches(val);
    if (!isEditing && code && widthInches && val) {
      setName(`${code} (${widthInches} x ${val} in)`);
    }
  };

  const handleCodeChange = (val: string) => {
    const uppercase = val.toUpperCase().trim();
    setCode(uppercase);
    if (!isEditing && widthInches && heightInches) {
      setName(`${uppercase} (${widthInches} x ${heightInches} in)`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const parsedWidth = parseFloat(widthInches);
    const parsedHeight = parseFloat(heightInches);
    const parsedPrice = parseFloat(basePrice);

    if (isNaN(parsedWidth) || parsedWidth <= 0 || isNaN(parsedHeight) || parsedHeight <= 0) {
      setErrorMessage("Width and Height must be positive numbers.");
      setIsSubmitting(false);
      return;
    }

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setErrorMessage("Please enter a valid non-negative base price.");
      setIsSubmitting(false);
      return;
    }

    try {
      if (isEditing && sizeToEdit) {
        const res = await updatePrintSize({
          id: sizeToEdit.id,
          tenantId,
          tenantSlug,
          code,
          name,
          widthInches: parsedWidth,
          heightInches: parsedHeight,
          basePrice: parsedPrice,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to update print size.");
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createPrintSize({
          tenantId,
          tenantSlug,
          code,
          name,
          widthInches: parsedWidth,
          heightInches: parsedHeight,
          basePrice: parsedPrice,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to create print size.");
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
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0d0d10] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              {isEditing ? <Edit2 className="size-4 text-amber-400" /> : <Plus className="size-4 text-amber-400" />}
              <span>{isEditing ? "Edit Print Dimension" : "Add Print Dimension"}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Available sizes scale to scale in the living room visualizer
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Size Code * (e.g. 12R)
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder="12R"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors uppercase"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Base Print Price ({currency}) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="85"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Display Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="12R (12 x 18 in)"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Width (Inches) *
              </label>
              <input
                type="number"
                step="0.1"
                min="1"
                required
                value={widthInches}
                onChange={(e) => handleWidthChange(e.target.value)}
                placeholder="12"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Height (Inches) *
              </label>
              <input
                type="number"
                step="0.1"
                min="1"
                required
                value={heightInches}
                onChange={(e) => handleHeightChange(e.target.value)}
                placeholder="18"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
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
                <span>{isEditing ? "Update Size" : "Add Size"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

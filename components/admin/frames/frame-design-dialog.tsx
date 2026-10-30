"use client";

import { useState, useEffect } from "react";
import { X, Plus, Edit2, AlertCircle, Loader2, Sparkles, Image as ImageIcon } from "lucide-react";
import { createFrameDesign, updateFrameDesign } from "@/lib/actions/admin-frames";

export interface FrameDesignRow {
  id: string;
  name: string;
  material: string;
  moldingWidth: number;
  frameColor: string;
  previewAsset: string;
  priceOffset: number;
  isAvailable: boolean;
}

interface FrameDesignDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  currency: string;
  frameToEdit?: FrameDesignRow | null;
  onSuccess?: () => void;
}

const MATERIALS = ["Solid Hardwood", "Brushed Aluminum", "Walnut Shadowbox", "Carved Gilded Wood", "Composite Acrylic"];
const PRESET_COLORS = [
  { label: "Matte Black", value: "#18181b" },
  { label: "Warm Walnut", value: "#78350f" },
  { label: "Burnished Gold", value: "#d97706" },
  { label: "Natural Oak", value: "#d4a373" },
  { label: "Gallery White", value: "#f4f4f5" },
];

export function FrameDesignDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  currency,
  frameToEdit,
  onSuccess,
}: FrameDesignDialogProps) {
  const isEditing = !!frameToEdit;

  const [name, setName] = useState(frameToEdit?.name || "");
  const [material, setMaterial] = useState(frameToEdit?.material || MATERIALS[0]!);
  const [moldingWidth, setMoldingWidth] = useState(frameToEdit?.moldingWidth?.toString() || "1.25");
  const [frameColor, setFrameColor] = useState(frameToEdit?.frameColor || "#18181b");
  const [previewAsset, setPreviewAsset] = useState(frameToEdit?.previewAsset || "/uploads/frames/matte-black.png");
  const [priceOffset, setPriceOffset] = useState(frameToEdit?.priceOffset?.toString() || "0");
  const [isAvailable, setIsAvailable] = useState(frameToEdit?.isAvailable ?? true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (frameToEdit) {
      setName(frameToEdit.name);
      setMaterial(frameToEdit.material);
      setMoldingWidth(frameToEdit.moldingWidth.toString());
      setFrameColor(frameToEdit.frameColor);
      setPreviewAsset(frameToEdit.previewAsset);
      setPriceOffset(frameToEdit.priceOffset.toString());
      setIsAvailable(frameToEdit.isAvailable);
    } else {
      setName("");
      setMaterial(MATERIALS[0]!);
      setMoldingWidth("1.25");
      setFrameColor("#18181b");
      setPreviewAsset("/uploads/frames/matte-black.png");
      setPriceOffset("0");
      setIsAvailable(true);
    }
    setErrorMessage(null);
  }, [frameToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const parsedWidth = parseFloat(moldingWidth);
    const parsedOffset = parseFloat(priceOffset);

    if (isNaN(parsedWidth) || parsedWidth <= 0) {
      setErrorMessage("Please enter a valid positive molding width.");
      setIsSubmitting(false);
      return;
    }

    try {
      if (isEditing && frameToEdit) {
        const res = await updateFrameDesign({
          id: frameToEdit.id,
          tenantId,
          tenantSlug,
          name,
          material,
          moldingWidth: parsedWidth,
          frameColor,
          previewAsset,
          priceOffset: isNaN(parsedOffset) ? 0 : parsedOffset,
          isAvailable,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to update frame design.");
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createFrameDesign({
          tenantId,
          tenantSlug,
          name,
          material,
          moldingWidth: parsedWidth,
          frameColor,
          previewAsset,
          priceOffset: isNaN(parsedOffset) ? 0 : parsedOffset,
          isAvailable,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to create frame design.");
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
              <span>{isEditing ? "Edit Frame Molding" : "Create Frame Molding"}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Configured moldings render dynamically in the interactive Wall Art Visualizer
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
              Frame Molding Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Matte Black Minimalist"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Material Construction *
              </label>
              <input
                type="text"
                required
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="Solid Hardwood"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Molding Width (Inches) *
              </label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                required
                value={moldingWidth}
                onChange={(e) => setMoldingWidth(e.target.value)}
                placeholder="1.25"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* Frame Color & Presets */}
          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Finish Color Hex / Finish Swatch *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={frameColor}
                onChange={(e) => setFrameColor(e.target.value)}
                className="size-9 rounded cursor-pointer border border-zinc-700 bg-transparent p-0.5"
              />
              <input
                type="text"
                required
                value={frameColor}
                onChange={(e) => setFrameColor(e.target.value)}
                placeholder="#18181b"
                className="w-32 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
              <div className="flex gap-1.5 flex-wrap ml-auto">
                {PRESET_COLORS.map((p) => (
                  <button
                    type="button"
                    key={p.value}
                    onClick={() => setFrameColor(p.value)}
                    className="size-7 rounded-full border border-zinc-600 transition-transform hover:scale-110"
                    style={{ backgroundColor: p.value }}
                    title={p.label}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Preview Asset Graphic / Swatch URL *
              </label>
              <input
                type="text"
                required
                value={previewAsset}
                onChange={(e) => setPreviewAsset(e.target.value)}
                placeholder="/uploads/frames/matte-black.png"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Price Offset ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={priceOffset}
                onChange={(e) => setPriceOffset(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* Availability Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div>
              <span className="text-xs font-medium text-white block">Available in Visualizer</span>
              <span className="text-[11px] text-zinc-400">Clients can configure this molding on living room mockups</span>
            </div>
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
              className="rounded border-zinc-600 text-amber-500 focus:ring-0 size-4"
            />
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
                <span>{isEditing ? "Update Frame" : "Create Frame"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

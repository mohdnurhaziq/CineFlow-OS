"use client";

import { useState, useEffect } from "react";
import { X, Plus, Edit2, AlertCircle, Sparkles, Loader2 } from "lucide-react";
import { createServicePackage, updateServicePackage } from "@/lib/actions/admin-services";

export interface PackageRow {
  id: string;
  name: string;
  category: string;
  discipline: string;
  price: number;
  depositPrice: number;
  description: string;
  deliverables: string;
  turnaround: string;
  isFeatured: boolean;
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  badgeIcon?: string | null;
}

interface PackageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  currency: string;
  categories: CategoryOption[];
  packageToEdit?: PackageRow | null;
  onSuccess?: () => void;
}

const DISCIPLINES = ["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"];

export function PackageDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  currency,
  categories,
  packageToEdit,
  onSuccess,
}: PackageDialogProps) {
  const isEditing = !!packageToEdit;

  const [name, setName] = useState(packageToEdit?.name || "");
  const [category, setCategory] = useState(
    packageToEdit?.category || categories[0]?.slug || "STUDIO_PORTRAIT"
  );
  const [discipline, setDiscipline] = useState(packageToEdit?.discipline || "PHOTOGRAPHY");
  const [price, setPrice] = useState(packageToEdit?.price?.toString() || "");
  const [depositPrice, setDepositPrice] = useState(
    packageToEdit?.depositPrice?.toString() || "50"
  );
  const [turnaround, setTurnaround] = useState(packageToEdit?.turnaround || "5-7 Business Days");
  const [description, setDescription] = useState(packageToEdit?.description || "");
  const [deliverables, setDeliverables] = useState(packageToEdit?.deliverables || "");
  const [isFeatured, setIsFeatured] = useState(packageToEdit?.isFeatured || false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (packageToEdit) {
      setName(packageToEdit.name);
      setCategory(packageToEdit.category);
      setDiscipline(packageToEdit.discipline);
      setPrice(packageToEdit.price.toString());
      setDepositPrice(packageToEdit.depositPrice.toString());
      setTurnaround(packageToEdit.turnaround);
      setDescription(packageToEdit.description);
      setDeliverables(packageToEdit.deliverables);
      setIsFeatured(packageToEdit.isFeatured);
    } else {
      setName("");
      setCategory(categories[0]?.slug || "STUDIO_PORTRAIT");
      setDiscipline("PHOTOGRAPHY");
      setPrice("");
      setDepositPrice("50");
      setTurnaround("5-7 Business Days");
      setDescription("");
      setDeliverables("");
      setIsFeatured(false);
    }
    setErrorMessage(null);
  }, [packageToEdit, categories, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const parsedPrice = parseFloat(price);
    const parsedDeposit = parseFloat(depositPrice);

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setErrorMessage("Please enter a valid non-negative price.");
      setIsSubmitting(false);
      return;
    }

    try {
      if (isEditing && packageToEdit) {
        const res = await updateServicePackage({
          id: packageToEdit.id,
          tenantId,
          tenantSlug,
          name,
          category,
          discipline: discipline as "PHOTOGRAPHY" | "VIDEOGRAPHY" | "HYBRID",
          price: parsedPrice,
          depositPrice: isNaN(parsedDeposit) ? 50 : parsedDeposit,
          turnaround,
          description,
          deliverables,
          isFeatured,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to update package.");
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createServicePackage({
          tenantId,
          tenantSlug,
          name,
          category,
          discipline: discipline as "PHOTOGRAPHY" | "VIDEOGRAPHY" | "HYBRID",
          price: parsedPrice,
          depositPrice: isNaN(parsedDeposit) ? 50 : parsedDeposit,
          turnaround,
          description,
          deliverables,
          isFeatured,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to create package.");
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
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              {isEditing ? <Edit2 className="size-4 text-amber-400" /> : <Plus className="size-4 text-amber-400" />}
              <span>{isEditing ? "Edit Service Package" : "Create New Service Package"}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Configure production tier scope, pricing, turnaround, and deliverables
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
              Package Title *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cinematic Brand Hero Campaign"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Discipline *
              </label>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              >
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Campaign Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.badgeIcon ? `${c.badgeIcon} ` : ""}{c.name} ({c.slug})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Total Price ({currency}) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="2500"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Deposit Price ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={depositPrice}
                onChange={(e) => setDepositPrice(e.target.value)}
                placeholder="50"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Turnaround *
              </label>
              <input
                type="text"
                required
                value={turnaround}
                onChange={(e) => setTurnaround(e.target.value)}
                placeholder="7 Business Days"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Deliverables Scope *
            </label>
            <input
              type="text"
              required
              value={deliverables}
              onChange={(e) => setDeliverables(e.target.value)}
              placeholder="e.g. 1x 90s Master Video, 3x 9:16 Social Cuts, 25 High-Res Stills"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
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
              placeholder="Detailed description of coverage hours, crew count, post-production color grading, and deliverables..."
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors resize-none"
            />
          </div>

          {/* Featured Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-amber-400" />
              <div>
                <span className="text-xs font-medium text-white block">Featured Package</span>
                <span className="text-[11px] text-zinc-400">Prominently highlighted on studio showcase</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
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
                <span>{isEditing ? "Update Package" : "Create Package"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

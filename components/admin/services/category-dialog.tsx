"use client";

import { useState, useEffect } from "react";
import { X, Plus, Edit2, AlertCircle, Loader2 } from "lucide-react";
import { createCampaignCategory, updateCampaignCategory } from "@/lib/actions/admin-services";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  badgeIcon?: string | null;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface CategoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  categoryToEdit?: CategoryRow | null;
  onSuccess?: () => void;
}

const EMOJI_PRESETS = ["🎓", "🌙", "💍", "🎬", "📸", "⚡", "🎨", "🏛️", "👑", "✨", "🎥", "💼"];

export function CategoryDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  categoryToEdit,
  onSuccess,
}: CategoryDialogProps) {
  const isEditing = !!categoryToEdit;

  const [name, setName] = useState(categoryToEdit?.name || "");
  const [slug, setSlug] = useState(categoryToEdit?.slug || "");
  const [badgeIcon, setBadgeIcon] = useState(categoryToEdit?.badgeIcon || "📸");
  const [description, setDescription] = useState(categoryToEdit?.description || "");
  const [sortOrder, setSortOrder] = useState(categoryToEdit?.sortOrder?.toString() || "0");
  const [isActive, setIsActive] = useState(categoryToEdit?.isActive ?? true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (categoryToEdit) {
      setName(categoryToEdit.name);
      setSlug(categoryToEdit.slug);
      setBadgeIcon(categoryToEdit.badgeIcon || "📸");
      setDescription(categoryToEdit.description || "");
      setSortOrder(categoryToEdit.sortOrder.toString());
      setIsActive(categoryToEdit.isActive);
    } else {
      setName("");
      setSlug("");
      setBadgeIcon("📸");
      setDescription("");
      setSortOrder("0");
      setIsActive(true);
    }
    setErrorMessage(null);
  }, [categoryToEdit, isOpen]);

  if (!isOpen) return null;

  // Auto-generate slug when name changes (only in create mode)
  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEditing) {
      const generated = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      setSlug(generated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const parsedOrder = parseInt(sortOrder, 10);

    try {
      if (isEditing && categoryToEdit) {
        const res = await updateCampaignCategory({
          id: categoryToEdit.id,
          tenantId,
          tenantSlug,
          name,
          slug,
          badgeIcon: badgeIcon || null,
          description: description || null,
          sortOrder: isNaN(parsedOrder) ? 0 : parsedOrder,
          isActive,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to update category.");
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createCampaignCategory({
          tenantId,
          tenantSlug,
          name,
          slug,
          badgeIcon: badgeIcon || null,
          description: description || null,
          sortOrder: isNaN(parsedOrder) ? 0 : parsedOrder,
          isActive,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to create category.");
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
              <span>{isEditing ? "Edit Campaign Category" : "New Campaign Category"}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Categories group packages, portfolio showcases, and booking slots
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
              Category Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Convocation Specials"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              URL Slug *
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="convocation-specials"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            <p className="text-[11px] text-zinc-400 mt-1">Lowercase letters, numbers, and hyphens only</p>
          </div>

          {/* Badge Icon Selector */}
          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Badge Icon Emoji
            </label>
            <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-zinc-900 border border-zinc-700">
              {EMOJI_PRESETS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => setBadgeIcon(emoji)}
                  className={`size-8 rounded flex items-center justify-center text-lg transition-all ${
                    badgeIcon === emoji
                      ? "bg-amber-500/20 border border-amber-500/40 scale-110"
                      : "hover:bg-zinc-800 border border-transparent"
                  }`}
                >
                  {emoji}
                </button>
              ))}
              <input
                type="text"
                value={badgeIcon}
                onChange={(e) => setBadgeIcon(e.target.value)}
                placeholder="Custom"
                className="w-16 px-2 py-1 rounded bg-zinc-800 border border-zinc-600 text-center text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Sort Order
              </label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-zinc-600 text-amber-500 focus:ring-0"
                />
                <span className="text-xs font-medium text-white">Active Status</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of category scope..."
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors resize-none"
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
                <span>{isEditing ? "Update Category" : "Create Category"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { X, Plus, Edit2, AlertCircle, Loader2, Sparkles, Upload, Image as ImageIcon, Video } from "lucide-react";
import { createShowcaseItem, updateShowcaseItem } from "@/lib/actions/admin-cms";

export interface ShowcaseItemRow {
  id: string;
  title: string;
  clientName: string;
  category: string;
  discipline: string;
  coverImageUrl: string;
  videoEmbedUrl?: string | null;
  galleryImages?: string | null;
  servicePackageId?: string | null;
  isFeatured: boolean;
  sortOrder: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  badgeIcon?: string | null;
}

export interface PackageOption {
  id: string;
  name: string;
}

interface ShowcaseItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  categories: CategoryOption[];
  packages: PackageOption[];
  itemToEdit?: ShowcaseItemRow | null;
  onSuccess?: () => void;
}

const DISCIPLINES = ["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"];

export function ShowcaseItemDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  categories,
  packages,
  itemToEdit,
  onSuccess,
}: ShowcaseItemDialogProps) {
  const isEditing = !!itemToEdit;

  const [title, setTitle] = useState(itemToEdit?.title || "");
  const [clientName, setClientName] = useState(itemToEdit?.clientName || "");
  const [category, setCategory] = useState(itemToEdit?.category || categories[0]?.slug || "STUDIO_PORTRAIT");
  const [discipline, setDiscipline] = useState<"PHOTOGRAPHY" | "VIDEOGRAPHY" | "HYBRID">(
    (itemToEdit?.discipline as any) || "PHOTOGRAPHY"
  );
  const [coverImageUrl, setCoverImageUrl] = useState(itemToEdit?.coverImageUrl || "");
  const [videoEmbedUrl, setVideoEmbedUrl] = useState(itemToEdit?.videoEmbedUrl || "");
  const [galleryImages, setGalleryImages] = useState(itemToEdit?.galleryImages || "");
  const [servicePackageId, setServicePackageId] = useState(itemToEdit?.servicePackageId || "");
  const [isFeatured, setIsFeatured] = useState(itemToEdit?.isFeatured ?? true);
  const [sortOrder, setSortOrder] = useState(itemToEdit?.sortOrder?.toString() || "0");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (itemToEdit) {
      setTitle(itemToEdit.title);
      setClientName(itemToEdit.clientName);
      setCategory(itemToEdit.category);
      setDiscipline((itemToEdit.discipline as any) || "PHOTOGRAPHY");
      setCoverImageUrl(itemToEdit.coverImageUrl);
      setVideoEmbedUrl(itemToEdit.videoEmbedUrl || "");
      setGalleryImages(itemToEdit.galleryImages || "");
      setServicePackageId(itemToEdit.servicePackageId || "");
      setIsFeatured(itemToEdit.isFeatured);
      setSortOrder(itemToEdit.sortOrder.toString());
    } else {
      setTitle("");
      setClientName("");
      setCategory(categories[0]?.slug || "STUDIO_PORTRAIT");
      setDiscipline("PHOTOGRAPHY");
      setCoverImageUrl("/uploads/showcase/default.jpg");
      setVideoEmbedUrl("");
      setGalleryImages("");
      setServicePackageId("");
      setIsFeatured(true);
      setSortOrder("0");
    }
    setErrorMessage(null);
  }, [itemToEdit, categories, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const parsedOrder = parseInt(sortOrder, 10);

    try {
      if (isEditing && itemToEdit) {
        const res = await updateShowcaseItem({
          id: itemToEdit.id,
          tenantId,
          tenantSlug,
          title,
          clientName,
          category,
          discipline,
          coverImageUrl,
          videoEmbedUrl: videoEmbedUrl || null,
          galleryImages: galleryImages || null,
          servicePackageId: servicePackageId || null,
          isFeatured,
          sortOrder: isNaN(parsedOrder) ? 0 : parsedOrder,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to update showcase item.");
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createShowcaseItem({
          tenantId,
          tenantSlug,
          title,
          clientName,
          category,
          discipline,
          coverImageUrl,
          videoEmbedUrl: videoEmbedUrl || null,
          galleryImages: galleryImages || null,
          servicePackageId: servicePackageId || null,
          isFeatured,
          sortOrder: isNaN(parsedOrder) ? 0 : parsedOrder,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to create showcase item.");
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
              <span>{isEditing ? "Edit Showcase Item" : "New Portfolio Showcase"}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Portfolio items are featured on the public studio landing page and campaigns
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Project Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Aurora Haute Couture — Fall Narrative"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Client Name / Brand *
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Aurora Apparel"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Discipline *
              </label>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as any)}
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
                    {c.badgeIcon ? `${c.badgeIcon} ` : ""}{c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Cover Image Asset URL *
            </label>
            <input
              type="text"
              required
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="/uploads/showcase/aurora-cover.jpg"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1 flex items-center gap-1">
              <Video className="size-3 text-amber-400" />
              <span>Video Streaming / Embed URL (Optional)</span>
            </label>
            <input
              type="text"
              value={videoEmbedUrl}
              onChange={(e) => setVideoEmbedUrl(e.target.value)}
              placeholder="https://player.vimeo.com/video/..."
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Linked Service Package (Optional)
              </label>
              <select
                value={servicePackageId}
                onChange={(e) => setServicePackageId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              >
                <option value="">None / Standalone Project</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

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
          </div>

          {/* Featured Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-amber-400" />
              <div>
                <span className="text-xs font-medium text-white block">Featured Showcase</span>
                <span className="text-[11px] text-zinc-400">Hero spotlight on public studio portfolio</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
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
                <span>{isEditing ? "Update Item" : "Create Showcase Item"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { buttonVariants } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import {
  Plus,
  Edit2,
  AlertCircle,
  Loader2,
  Sparkles,
  Video,
  Upload,
  Trash2,
  Star,
  Image as ImageIcon,
} from "lucide-react";
import { createShowcaseItem, updateShowcaseItem } from "@/lib/actions/admin-cms";
import { useDialog } from "@/lib/use-dialog";
import { disciplineLabel } from "@/lib/labels";
import { errorMessageOf } from "@/lib/action-error";
import { toast } from "sonner";
import { SHOWCASE_PLACEHOLDER, editableShowcasePhotos, showcaseCover } from "@/lib/showcase/cover";
import { DialogCloseButton } from "@/components/ui/dialog-close-button";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

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

type ShowcaseDiscipline = "PHOTOGRAPHY" | "VIDEOGRAPHY" | "HYBRID";

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
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(itemToEdit?.title || "");
  const [clientName, setClientName] = useState(itemToEdit?.clientName || "");
  const [category, setCategory] = useState(itemToEdit?.category || categories[0]?.slug || "STUDIO_PORTRAIT");
  const [discipline, setDiscipline] = useState<ShowcaseDiscipline>(
    (itemToEdit?.discipline as ShowcaseDiscipline | undefined) || "PHOTOGRAPHY"
  );
  const [coverImageUrl, setCoverImageUrl] = useState(editableShowcasePhotos(itemToEdit?.coverImageUrl, null).cover);
  const [videoEmbedUrl, setVideoEmbedUrl] = useState(itemToEdit?.videoEmbedUrl || "");
  const [images, setImages] = useState<string[]>([]);
  const [servicePackageId, setServicePackageId] = useState(itemToEdit?.servicePackageId || "");
  const [isFeatured, setIsFeatured] = useState(itemToEdit?.isFeatured ?? true);
  const [sortOrder, setSortOrder] = useState(itemToEdit?.sortOrder?.toString() || "0");

  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (itemToEdit) {
      setTitle(itemToEdit.title);
      setClientName(itemToEdit.clientName);
      setCategory(itemToEdit.category);
      setDiscipline((itemToEdit.discipline as ShowcaseDiscipline | undefined) || "PHOTOGRAPHY");
      // The placeholder is never a photo or a cover: the first real photo uploaded becomes the cover.
      const editable = editableShowcasePhotos(itemToEdit.coverImageUrl, itemToEdit.galleryImages);
      setCoverImageUrl(editable.cover);
      setVideoEmbedUrl(itemToEdit.videoEmbedUrl || "");
      setServicePackageId(itemToEdit.servicePackageId || "");
      setIsFeatured(itemToEdit.isFeatured);
      setSortOrder(itemToEdit.sortOrder.toString());
      setImages(editable.images);
    } else {
      setTitle("");
      setClientName("");
      setCategory(categories[0]?.slug || "STUDIO_PORTRAIT");
      setDiscipline("PHOTOGRAPHY");
      setCoverImageUrl("");
      setVideoEmbedUrl("");
      setImages([]);
      setServicePackageId("");
      setIsFeatured(true);
      setSortOrder("0");
    }
    setErrorMessage(null);
    setShowManualUrl(false);
  }, [itemToEdit, categories, isOpen]);

  const dialog = useDialog(isOpen, onClose);
  if (!isOpen) return null;

  // Handle uploading multiple images
  const uploadFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setIsUploadingImages(true);
    const uploadedUrls: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]!;
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image (JPG, PNG, WebP only).`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} exceeds 10 MB limit.`);
        continue;
      }

      setUploadProgressText(`Uploading ${i + 1} of ${fileList.length}...`);
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("folder", "showcase");
        const res = await fetch("/api/upload", { method: "POST", body });
        const json = await res.json();
        if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
        uploadedUrls.push(json.url);
      } catch (err) {
        toast.error(`Upload error on ${file.name}: ${errorMessageOf(err)}`);
      }
    }

    setIsUploadingImages(false);
    setUploadProgressText(null);

    if (uploadedUrls.length > 0) {
      setImages((prev) => {
        const updated = [...prev, ...uploadedUrls];
        if (showcaseCover(coverImageUrl) === SHOWCASE_PLACEHOLDER) {
          setCoverImageUrl(updated[0]!);
        }
        return updated;
      });
      toast.success(`Uploaded ${uploadedUrls.length} photo${uploadedUrls.length === 1 ? "" : "s"}.`);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast.error("Please select an MP4 or MOV video file.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error("Video exceeds 200 MB limit.");
      return;
    }

    setIsUploadingVideo(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "showcase");
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
      setVideoEmbedUrl(json.url);
      setDiscipline("VIDEOGRAPHY");
      toast.success("Video uploaded.");
    } catch (err) {
      toast.error(errorMessageOf(err) || "Failed to upload video.");
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const removeImage = (urlToRemove: string) => {
    setImages((prev) => {
      const updated = prev.filter((u) => u !== urlToRemove);
      if (coverImageUrl === urlToRemove) {
        setCoverImageUrl(updated[0] || "");
      }
      return updated;
    });
  };

  const setAsCover = (url: string) => {
    setCoverImageUrl(url);
    toast.success("Set as cover image.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const parsedOrder = parseInt(sortOrder, 10);
    const finalCover = coverImageUrl || images[0] || SHOWCASE_PLACEHOLDER;
    const remainingGallery = images.filter((u) => u !== finalCover);
    const galleryPayload = remainingGallery.length > 0 ? JSON.stringify(remainingGallery) : null;

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
          coverImageUrl: finalCover,
          videoEmbedUrl: videoEmbedUrl || null,
          galleryImages: galleryPayload,
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
          coverImageUrl: finalCover,
          videoEmbedUrl: videoEmbedUrl || null,
          galleryImages: galleryPayload,
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
    } catch (err) {
      setErrorMessage(errorMessageOf(err) || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-0">
      <div
        {...dialog}
        aria-labelledby="showcase-item-dialog-title"
        className="relative w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#0d0d10] p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h3
              id="showcase-item-dialog-title"
              className="text-base font-bold text-white tracking-tight flex items-center gap-2"
            >
              {isEditing ? (
                <Edit2 className="size-4 text-amber-400" />
              ) : (
                <Plus className="size-4 text-amber-400" />
              )}
              <span>{isEditing ? "Edit Showcase Item" : "New Portfolio Showcase"}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Portfolio items are featured on the public studio landing page and campaigns
            </p>
          </div>
          <DialogCloseButton onClick={onClose} />
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-5 pt-4">
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
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-amber-500 transition-colors"
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
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-amber-500 transition-colors"
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
                onChange={(e) => setDiscipline(e.target.value as ShowcaseDiscipline)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              >
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>
                    {disciplineLabel(d)}
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
                    {c.badgeIcon ? `${c.badgeIcon} ` : ""}
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Multi-Photo Upload & Showcase Gallery Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-zinc-400 flex items-center gap-1.5">
                <ImageIcon className="size-3.5 text-amber-400" />
                <span>Portfolio Photos (Cover & Gallery)</span>
              </label>
              <button
                type="button"
                onClick={() => setShowManualUrl((v) => !v)}
                className="text-[11px] font-mono text-zinc-400 hover:text-amber-400 transition-colors"
              >
                {showManualUrl ? "Hide manual URL" : "Paste URL manually"}
              </button>
            </div>

            {/* Drag & Drop Zone with Multi-Select */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files.length > 0) {
                  uploadFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => multiFileInputRef.current?.click()}
              className={`rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${
                dragActive
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-zinc-700 hover:border-zinc-600 bg-zinc-900/40"
              }`}
            >
              <input
                ref={multiFileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    uploadFiles(e.target.files);
                    e.target.value = "";
                  }
                }}
                className="hidden"
              />

              {isUploadingImages ? (
                <div className="flex flex-col items-center justify-center py-2">
                  <Loader2 className="size-6 animate-spin text-amber-400 mb-2" />
                  <span className="text-xs text-white font-medium">
                    {uploadProgressText || "Uploading photos..."}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-1">
                  <Upload className="size-6 text-amber-400 mb-1.5" />
                  <p className="text-xs font-semibold text-white">
                    Drop multiple photos here, or <span className="text-amber-400 underline">browse</span>
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Select multiple JPG, PNG, or WebP files at once. First photo becomes the cover.
                  </p>
                </div>
              )}
            </div>

            {/* Manual URL Input (expandable) */}
            {showManualUrl && (
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                <span className="text-[11px] font-mono text-zinc-400 block">Cover Image URL</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={coverImageUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCoverImageUrl(val);
                      if (val && !images.includes(val)) {
                        setImages((prev) => [val, ...prev]);
                      }
                    }}
                    placeholder="/uploads/showcase/aurora-cover.jpg"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-white font-mono placeholder-zinc-400 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}

            {/* Thumbnails Gallery Grid */}
            {images.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>{images.length} photo{images.length === 1 ? "" : "s"} attached</span>
                  <button
                    type="button"
                    onClick={() => multiFileInputRef.current?.click()}
                    className="text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="size-3" /> Add more
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-48 overflow-y-auto p-1">
                  {images.map((url, index) => {
                    const isCover = coverImageUrl ? url === coverImageUrl : index === 0;

                    return (
                      <div
                        key={url}
                        className={`group relative aspect-square rounded-xl overflow-hidden border bg-zinc-900 transition-all ${
                          isCover
                            ? "border-amber-400 ring-2 ring-amber-400/30"
                            : "border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="size-full object-cover" />

                        {/* Top Badges */}
                        <div className="absolute top-1.5 left-1.5">
                          {isCover && (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500 text-black shadow-md flex items-center gap-0.5">
                              <Star className="size-2.5 fill-black" /> Cover
                            </span>
                          )}
                        </div>

                        {/* Action Overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5">
                          <button
                            type="button"
                            onClick={() => removeImage(url)}
                            className="self-end p-1 rounded-md bg-black/70 text-zinc-300 hover:text-red-400 transition-colors"
                            title="Remove photo"
                          >
                            <Trash2 className="size-3" />
                          </button>

                          {!isCover && (
                            <button
                              type="button"
                              onClick={() => setAsCover(url)}
                              className="w-full py-1 rounded bg-amber-500/90 hover:bg-amber-500 text-[11px] font-mono font-bold text-black text-center transition-colors shadow"
                            >
                              Set as Cover
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Video Section */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-zinc-400 block flex items-center gap-1.5">
              <Video className="size-3.5 text-amber-400" />
              <span>Video Showcase (Optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={videoEmbedUrl}
                onChange={(e) => setVideoEmbedUrl(e.target.value)}
                placeholder="https://player.vimeo.com/video/... or upload a video file"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-400 focus:outline-none focus:border-amber-500 transition-colors"
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/quicktime"
                onChange={handleVideoUpload}
                className="hidden"
              />
              <button
                type="button"
                disabled={isUploadingVideo}
                onClick={() => videoInputRef.current?.click()}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 hover:border-amber-500/60 text-xs font-medium text-zinc-200 hover:text-white disabled:opacity-50 transition-colors"
              >
                {isUploadingVideo ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Video className="size-3.5 text-amber-400" />
                )}
                {isUploadingVideo ? "Uploading…" : "Upload Video"}
              </button>
            </div>
            <p className="text-[11px] text-zinc-400">
              Paste an external Vimeo / YouTube embed URL, or upload an MP4/MOV file (up to 200 MB).
            </p>
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
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-400 focus:outline-none focus:border-amber-500 transition-colors"
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
              disabled={isSubmitting || isUploadingImages || isUploadingVideo}
              className="px-4 py-2 rounded-lg text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isUploadingImages || isUploadingVideo}
              className={buttonVariants()}
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

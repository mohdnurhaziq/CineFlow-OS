"use client";

import { useState } from "react";
import {
  Heart,
  MessageSquare,
  Download,
  Lock,
  Maximize2,
  X,
  Sparkles,
  Filter,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { RetouchNotesModal } from "./retouch-notes-modal";
import { toggleClientFavorite } from "@/lib/actions/vault";

export interface PhotoItem {
  id: string;
  itemType: string;
  title: string;
  previewUrl: string;
  downloadUrl: string;
  thumbnailUrl?: string | null;
  resolution?: string | null;
  fileSize?: string | null;
  isClientFav: boolean;
  clientNotes?: string | null;
}

interface PhotoGridProps {
  items: PhotoItem[];
  projectId: string;
  isFinalBalancePaid: boolean;
}

export function PhotoGrid({ items, projectId, isFinalBalancePaid }: PhotoGridProps) {
  const [filterFavsOnly, setFilterFavsOnly] = useState(false);
  const [activeItems, setActiveItems] = useState<PhotoItem[]>(items);

  // Retouch Modal State
  const [retouchTarget, setRetouchTarget] = useState<PhotoItem | null>(null);

  // Lightbox Modal State
  const [lightboxItem, setLightboxItem] = useState<PhotoItem | null>(null);

  const handleToggleFav = async (itemId: string, currentFav: boolean) => {
    // Optimistic UI update
    setActiveItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, isClientFav: !currentFav } : i))
    );

    try {
      const res = await toggleClientFavorite({
        itemId,
        isFav: !currentFav,
      });

      if (res.success) {
        toast.success(
          res.isClientFav ? "Added photo to favorites ❤️" : "Removed photo from favorites"
        );
      } else {
        // Revert
        setActiveItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, isClientFav: currentFav } : i))
        );
        toast.error("Failed to update favorite status.");
      }
    } catch {
      setActiveItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, isClientFav: currentFav } : i))
      );
      toast.error("Network error updating favorite.");
    }
  };

  const handleNoteSaved = (itemId: string, newNote: string | null) => {
    setActiveItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, clientNotes: newNote } : i))
    );
  };

  const displayedItems = filterFavsOnly
    ? activeItems.filter((i) => i.isClientFav)
    : activeItems;

  const totalFavs = activeItems.filter((i) => i.isClientFav).length;

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block">
            GALLERY PROOFING &amp; SELECTIONS
          </span>
          <h3 className="text-xl font-bold text-white tracking-tight">
            High-Resolution Photo Deliverables ({activeItems.length})
          </h3>
        </div>

        {/* Filter Switch */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterFavsOnly(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
              !filterFavsOnly
                ? "bg-amber-500 text-black font-bold"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            All Proofs ({activeItems.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterFavsOnly(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              filterFavsOnly
                ? "bg-amber-500 text-black font-bold"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            <Heart className="size-3 fill-red-500 text-red-500" />
            <span>Favorites ({totalFavs})</span>
          </button>
        </div>
      </div>

      {/* Photo Grid */}
      {displayedItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-zinc-800 bg-[#121215] space-y-2">
          <Heart className="size-8 text-zinc-600 mx-auto" />
          <h4 className="text-sm font-bold text-white">No Favorites Selected Yet</h4>
          <p className="text-xs text-zinc-400">
            Click the heart icon on any photo proof to curate your favorites.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {displayedItems.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-zinc-800 bg-[#121215] overflow-hidden shadow-lg hover:border-zinc-700 transition-all group flex flex-col justify-between"
            >
              {/* Photo Image Aspect Box */}
              <div className="relative aspect-[3/2] overflow-hidden bg-black/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.title}
                  className="size-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Watermark Overlay Banner if Unpaid */}
                {!isFinalBalancePaid && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <span className="transform -rotate-12 px-3 py-1 rounded bg-black/60 backdrop-blur-xs border border-amber-500/30 text-[10px] font-mono tracking-widest text-amber-300 font-bold uppercase shadow-lg">
                      Watermarked Proof
                    </span>
                  </div>
                )}

                {/* Top Action Floating Icons */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                  {/* Favorite Heart Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleFav(item.id, item.isClientFav)}
                    className="p-1.5 rounded-lg bg-black/70 backdrop-blur-xs border border-white/10 hover:bg-black text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    title={item.isClientFav ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Heart
                      className={`size-4 ${
                        item.isClientFav ? "fill-red-500 text-red-500" : "text-zinc-300"
                      }`}
                    />
                  </button>

                  {/* Retouch Feedback Button */}
                  <button
                    type="button"
                    onClick={() => setRetouchTarget(item)}
                    className="p-1.5 rounded-lg bg-black/70 backdrop-blur-xs border border-white/10 hover:bg-black text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    title="Add retouch feedback"
                  >
                    <MessageSquare className="size-4" />
                  </button>

                  {/* Fullscreen Lightbox Button */}
                  <button
                    type="button"
                    onClick={() => setLightboxItem(item)}
                    className="p-1.5 rounded-lg bg-black/70 backdrop-blur-xs border border-white/10 hover:bg-black text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    title="Zoom proof"
                  >
                    <Maximize2 className="size-4" />
                  </button>
                </div>
              </div>

              {/* Bottom Card Footer */}
              <div className="p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-white truncate" title={item.title}>
                    {item.title}
                  </h4>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 mt-0.5">
                    {item.resolution && <span>{item.resolution}</span>}
                    {item.fileSize && (
                      <>
                        <span>•</span>
                        <span>{item.fileSize}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Retouch note preview tag */}
                {item.clientNotes && (
                  <div
                    onClick={() => setRetouchTarget(item)}
                    className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 line-clamp-2 cursor-pointer hover:bg-amber-500/15"
                    title="Click to edit feedback"
                  >
                    <span className="font-mono text-[9px] uppercase font-bold text-amber-400 block">
                      Retouch Note:
                    </span>
                    {item.clientNotes}
                  </div>
                )}

                {/* Master Download Action */}
                <div className="pt-2 border-t border-zinc-800">
                  {isFinalBalancePaid ? (
                    <a
                      href={`/api/download?projectId=${projectId}&assetId=${item.id}&type=photo_master`}
                      download
                      className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="size-3.5 text-amber-400" />
                      <span>Download Master</span>
                    </a>
                  ) : (
                    <button
                      disabled
                      className="w-full py-2 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 text-xs font-mono flex items-center justify-center gap-1.5 cursor-not-allowed opacity-60"
                      title="Settle 50% balance to unlock master downloads"
                    >
                      <Lock className="size-3.5" />
                      <span>Master Locked</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Retouch Notes Modal */}
      {retouchTarget && (
        <RetouchNotesModal
          isOpen={true}
          onClose={() => setRetouchTarget(null)}
          itemId={retouchTarget.id}
          itemTitle={retouchTarget.title}
          initialNote={retouchTarget.clientNotes}
          thumbnailUrl={retouchTarget.previewUrl}
          onNoteSaved={(newNote) => handleNoteSaved(retouchTarget.id, newNote)}
        />
      )}

      {/* Fullscreen Photo Lightbox Modal */}
      {lightboxItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-fadeIn">
          <div className="absolute inset-0" onClick={() => setLightboxItem(null)} />

          <div className="relative z-10 max-w-5xl w-full max-h-[90vh] bg-[#121215] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#15151a]">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block">
                  PROOF INSPECTION
                </span>
                <h3 className="text-sm font-bold text-white">{lightboxItem.title}</h3>
              </div>

              <button
                onClick={() => setLightboxItem(null)}
                className="p-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-black p-6 flex items-center justify-center relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxItem.previewUrl}
                alt={lightboxItem.title}
                className="max-h-[70vh] w-auto object-contain rounded-lg shadow-2xl"
              />

              {!isFinalBalancePaid && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <span className="transform -rotate-12 px-4 py-2 rounded-lg bg-black/75 border border-amber-500/40 text-xs font-mono tracking-widest text-amber-300 font-bold uppercase shadow-2xl">
                    Watermarked Proof — Final Balance Due
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

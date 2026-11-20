"use client";

import { useState, useEffect } from "react";
import { X, Camera, Aperture, Sliders, ChevronLeft, ChevronRight } from "lucide-react";
import { useDialog } from "@/lib/use-dialog";
import { showcaseCover } from "@/lib/showcase/cover";

export interface LightboxItem {
  id: string;
  title: string;
  clientName: string;
  category: string;
  coverImageUrl: string;
  discipline: string;
  galleryImages?: string | null;
}

interface MediaLightboxModalProps {
  item: LightboxItem | null;
  onClose: () => void;
  brandColor?: string | null;
}

function parseGallery(item: LightboxItem): string[] {
  const list = [showcaseCover(item.coverImageUrl)];
  if (item.galleryImages) {
    try {
      const parsed = JSON.parse(item.galleryImages);
      if (Array.isArray(parsed)) {
        list.push(...parsed.filter((x): x is string => typeof x === "string" && Boolean(x)));
      }
    } catch {
      list.push(...item.galleryImages.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }
  return Array.from(new Set(list));
}

export function MediaLightboxModal({ item, onClose, brandColor }: MediaLightboxModalProps) {
  const dialog = useDialog(!!item, onClose);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [item?.id]);

  if (!item) return null;

  const images = parseGallery(item);
  const activeImage = images[currentIndex] || showcaseCover(item.coverImageUrl);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-md animate-fadeIn">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div
        {...dialog}
        aria-labelledby="media-lightbox-modal-title"
        className="relative z-10 max-w-5xl w-full rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
      >
        {/* Modal Top Bar */}
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-[#15151a]">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-mono font-bold px-2 py-0.5 rounded uppercase"
              style={{
                backgroundColor: `${brandColor || "#f59e0b"}20`,
                color: brandColor || "#f59e0b",
              }}
            >
              {item.category}
            </span>
            <span className="text-xs text-zinc-400 font-mono">• Client: {item.clientName}</span>
            {images.length > 1 && (
              <span className="text-xs text-amber-400/90 font-mono ml-2">
                ({currentIndex + 1} of {images.length})
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Image Display Area with Navigation Arrows */}
        <div className="relative flex-1 bg-black/80 flex items-center justify-center p-4 overflow-hidden min-h-[350px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeImage}
            alt={item.title}
            className="max-h-[60vh] w-auto max-w-full object-contain rounded-lg shadow-lg transition-all duration-200"
          />

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/10 transition-transform active:scale-95"
                aria-label="Previous image"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/10 transition-transform active:scale-95"
                aria-label="Next image"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>

        {/* Filmstrip Strip if Multiple Images */}
        {images.length > 1 && (
          <div className="px-4 py-2 border-t border-zinc-800/80 bg-[#0e0e11] flex items-center gap-2 overflow-x-auto">
            {images.map((img, idx) => (
              <button
                key={img}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`size-12 rounded-lg overflow-hidden border shrink-0 transition-all ${
                  idx === currentIndex
                    ? "border-amber-400 ring-2 ring-amber-400/30 scale-105"
                    : "border-zinc-800 opacity-60 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Modal Footer with EXIF Technical Camera Specs */}
        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-[#121215] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 id="media-lightbox-modal-title" className="text-base font-bold text-white tracking-tight">
              {item.title}
            </h3>
            <p className="text-xs text-zinc-400">Captured on medium format camera with prime optics.</p>
          </div>

          {/* Technical Metadata Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-300">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#18181b] border border-zinc-800">
              <Camera className="size-3.5 text-amber-400" />
              <span>Hasselblad H6D-100c</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#18181b] border border-zinc-800">
              <Aperture className="size-3.5 text-cyan-400" />
              <span>100mm f/2.2</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#18181b] border border-zinc-800">
              <Sliders className="size-3.5 text-emerald-400" />
              <span>ISO 100 • 1/250s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

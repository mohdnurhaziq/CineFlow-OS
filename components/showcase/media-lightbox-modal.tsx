"use client";

import { X, Camera, Aperture, Sliders, Maximize2 } from "lucide-react";

export interface LightboxItem {
  id: string;
  title: string;
  clientName: string;
  category: string;
  coverImageUrl: string;
  discipline: string;
}

interface MediaLightboxModalProps {
  item: LightboxItem | null;
  onClose: () => void;
  brandColor?: string | null;
}

export function MediaLightboxModal({ item, onClose, brandColor }: MediaLightboxModalProps) {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-md animate-fadeIn">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 max-w-5xl w-full rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
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
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Image Area */}
        <div className="flex-1 bg-black/80 flex items-center justify-center p-4 overflow-hidden min-h-[300px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.coverImageUrl}
            alt={item.title}
            className="max-h-[60vh] w-auto max-w-full object-contain rounded-lg shadow-lg"
          />
        </div>

        {/* Modal Footer with EXIF Technical Camera Specs */}
        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-[#121215] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">{item.title}</h3>
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

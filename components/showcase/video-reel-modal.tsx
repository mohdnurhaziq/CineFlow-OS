"use client";

import { X, Film, Play, Volume2 } from "lucide-react";

export interface VideoItem {
  id: string;
  title: string;
  clientName: string;
  category: string;
  coverImageUrl: string;
  videoEmbedUrl?: string | null;
  discipline: string;
}

interface VideoReelModalProps {
  item: VideoItem | null;
  onClose: () => void;
  brandColor?: string | null;
}

export function VideoReelModal({ item, onClose, brandColor }: VideoReelModalProps) {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-md animate-fadeIn">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 max-w-4xl w-full rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden shadow-2xl flex flex-col">
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

        {/* 16:9 Cinema Video Container */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {item.videoEmbedUrl ? (
            <iframe
              src={item.videoEmbedUrl}
              title={item.title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="relative w-full h-full flex flex-col items-center justify-center p-8 text-center bg-zinc-950">
              {/* Fallback Cinema Mockup */}
              <div className="size-16 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-400 mb-4 animate-pulse">
                <Play className="size-8 ml-1" />
              </div>
              <h4 className="text-lg font-bold text-white tracking-tight">{item.title}</h4>
              <p className="text-xs text-zinc-400 mt-1 max-w-md">
                4K Master ProRes Cinema Cut (Color Graded in DaVinci Resolve Studio).
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-mono text-zinc-400 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800">
                <Volume2 className="size-3.5 text-zinc-400" />
                <span>Dolby Atmos 5.1 Master Mix</span>
              </div>
            </div>
          )}
        </div>

        {/* Video Info Footer */}
        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-[#121215] flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-white tracking-tight">{item.title}</h3>
            <p className="text-xs text-zinc-400 font-mono">
              Shot on ARRI ALEXA Mini LF • Cooke Anamorphic /i Full Frame Plus
            </p>
          </div>
          <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/30">
            4K DCI MASTER
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Play, Eye, Camera, Film } from "lucide-react";
import type { LightboxItem } from "./media-lightbox-modal";
import type { VideoItem } from "./video-reel-modal";

export interface ShowcasePortfolioItem {
  id: string;
  category: string;
  title: string;
  clientName: string;
  discipline: string;
  coverImageUrl: string;
  videoEmbedUrl?: string | null;
  servicePackage?: {
    id: string;
    name: string;
    discipline: string;
    price: number;
  } | null;
}

interface PortfolioGridProps {
  items: ShowcasePortfolioItem[];
  onOpenLightbox: (item: LightboxItem) => void;
  onOpenVideo: (item: VideoItem) => void;
  brandColor?: string | null;
}

export function PortfolioGrid({
  items,
  onOpenLightbox,
  onOpenVideo,
  brandColor,
}: PortfolioGridProps) {
  if (items.length === 0) {
    return (
      <div className="py-16 text-center rounded-2xl border border-zinc-800 bg-[#121215] space-y-3">
        <Camera className="size-8 mx-auto text-zinc-500" />
        <h4 className="text-base font-bold text-white">No Portfolio Works in this Category</h4>
        <p className="text-xs text-zinc-400 max-w-sm mx-auto">
          The studio is curating new deliverables for this campaign. Check out other categories or explore our service packages below.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((item) => {
        const isVideo = Boolean(item.videoEmbedUrl || item.discipline === "VIDEOGRAPHY");

        return (
          <div
            key={item.id}
            onClick={() => {
              if (isVideo) {
                onOpenVideo(item);
              } else {
                onOpenLightbox(item);
              }
            }}
            className="group relative rounded-xl border border-zinc-800 bg-[#121215] overflow-hidden cursor-pointer hover:border-zinc-700 hover:bg-[#151518] transition-all duration-200 active:scale-[0.98] shadow-lg flex flex-col justify-between"
          >
            {/* Image Thumbnail Container */}
            <div className="relative aspect-[4/3] bg-zinc-900 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.coverImageUrl}
                alt={item.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />

              {/* Gradient Vignette Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

              {/* Discipline / Media Type Badge */}
              <div className="absolute top-3 left-3">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/10 text-white">
                  {isVideo ? <Film className="size-3 text-cyan-400" /> : <Camera className="size-3 text-amber-400" />}
                  <span>{item.category}</span>
                </span>
              </div>

              {/* Center Play/Inspect Overlay */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div
                  className="size-12 rounded-full flex items-center justify-center text-black font-bold shadow-xl transition-transform group-hover:scale-110"
                  style={{ backgroundColor: brandColor || "#f59e0b" }}
                >
                  {isVideo ? <Play className="size-5 ml-0.5" /> : <Eye className="size-5" />}
                </div>
              </div>

              {/* Bottom Attribution on Image */}
              <div className="absolute bottom-3 left-3 right-3">
                <div className="text-xs font-mono text-zinc-300">Client: {item.clientName}</div>
                <h3 className="text-sm font-bold text-white tracking-tight line-clamp-1">
                  {item.title}
                </h3>
              </div>
            </div>

            {/* Bottom Card Footer with Package Link if attached */}
            {item.servicePackage && (
              <div className="p-3 border-t border-zinc-800/80 bg-[#15151a] flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span className="line-clamp-1">{item.servicePackage.name}</span>
                <span className="text-amber-400 font-bold tabular-nums shrink-0">
                  ${item.servicePackage.price.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

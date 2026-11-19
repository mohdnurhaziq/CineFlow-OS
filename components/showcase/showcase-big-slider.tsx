"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Eye,
  Camera,
  Film,
  Layers,
  Sparkles,
} from "lucide-react";
import type { ShowcasePortfolioItem } from "./portfolio-grid";
import type { LightboxItem } from "./media-lightbox-modal";
import type { VideoItem } from "./video-reel-modal";
import { categoryName } from "@/lib/bookings/category-name";
import { disciplineLabel } from "@/lib/labels";

interface ShowcaseBigSliderProps {
  items: ShowcasePortfolioItem[];
  onOpenLightbox: (item: LightboxItem) => void;
  onOpenVideo: (item: VideoItem) => void;
  brandColor?: string | null;
  categories?: ReadonlyArray<{ slug: string; name: string; badgeIcon?: string | null }>;
}

const SLIDE_DURATION = 6000; // 6 seconds per slide

export function ShowcaseBigSlider({
  items,
  onOpenLightbox,
  onOpenVideo,
  brandColor = "#f59e0b",
  categories = [],
}: ShowcaseBigSliderProps) {
  const accentColor = brandColor || "#f59e0b";
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const total = items.length;

  const nextSlide = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % total);
    setProgress(0);
  }, [total]);

  const prevSlide = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + total) % total);
    setProgress(0);
  }, [total]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
    setProgress(0);
  };

  // Progress bar & auto-play timer
  useEffect(() => {
    if (total <= 1 || !isPlaying || isHovered) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }

    const stepMs = 50;
    const increment = (stepMs / SLIDE_DURATION) * 100;

    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          nextSlide();
          return 0;
        }
        return prev + increment;
      });
    }, stepMs);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [total, isPlaying, isHovered, nextSlide, currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prevSlide();
      if (e.key === "ArrowRight") nextSlide();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevSlide, nextSlide]);

  if (total === 0) return null;

  const currentItem = items[currentIndex]!;
  const isVideo = Boolean(currentItem.videoEmbedUrl || currentItem.discipline === "VIDEOGRAPHY");
  const catName = categoryName(categories, currentItem.category);
  const catObj = categories.find((c) => c.slug === currentItem.category);

  // Touch swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0]!.clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0]!.clientX;
    const diff = touchStart - touchEnd;
    if (diff > 50) nextSlide();
    else if (diff < -50) prevSlide();
    setTouchStart(null);
  };

  const handleActionClick = () => {
    if (isVideo) {
      onOpenVideo(currentItem);
    } else {
      onOpenLightbox(currentItem);
    }
  };

  return (
    <section className="space-y-3" aria-label="Featured Portfolio Showcase">
      {/* Slider Header Line */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4" style={{ color: accentColor }} />
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-semibold">
            Featured Portfolio Showcase
          </span>
        </div>

        {total > 1 && (
          <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
            <span>
              <strong className="text-white">
                {String(currentIndex + 1).padStart(2, "0")}
              </strong>{" "}
              / {String(total).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="p-1 rounded text-zinc-400 hover:text-white transition-colors"
              title={isPlaying ? "Pause autoplay" : "Resume autoplay"}
            >
              {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* Main Big Slider Container */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="group relative w-full h-[400px] sm:h-[500px] md:h-[580px] lg:h-[640px] rounded-3xl overflow-hidden border border-zinc-800 bg-[#0d0d10] shadow-2xl select-none"
      >
        {/* Background Slide Images with Crossfade */}
        {items.map((item, index) => {
          const isActive = index === currentIndex;

          return (
            <div
              key={item.id}
              className={`absolute inset-0 transition-opacity duration-700 ease-out ${
                isActive ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.coverImageUrl}
                alt={item.title}
                className={`size-full object-cover transition-transform duration-1000 ease-out ${
                  isActive ? "scale-100" : "scale-105"
                }`}
              />
            </div>
          );
        })}

        {/* Cinematic Vignette & Gradients Overlay */}
        <div className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-t from-black/90 via-black/30 to-black/40" />

        {/* Ambient Brand Color Tint */}
        <div
          className="absolute inset-0 z-20 pointer-events-none opacity-20 mix-blend-overlay"
          style={{
            background: `radial-gradient(circle at 70% 30%, ${accentColor} 0%, transparent 70%)`,
          }}
        />

        {/* Top Badges */}
        <div className="absolute top-5 left-5 right-5 z-30 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-black/70 backdrop-blur-md text-white border border-white/10 flex items-center gap-1.5 shadow-lg">
              {currentItem.discipline === "VIDEOGRAPHY" ? (
                <Film className="size-3.5 text-cyan-400" />
              ) : currentItem.discipline === "PHOTOGRAPHY" ? (
                <Camera className="size-3.5 text-amber-400" />
              ) : (
                <Layers className="size-3.5 text-amber-400" />
              )}
              <span>{disciplineLabel(currentItem.discipline)}</span>
            </span>

            <span
              className="px-3 py-1 rounded-full text-xs font-mono font-bold backdrop-blur-md border shadow-lg uppercase tracking-wider"
              style={{
                backgroundColor: `${accentColor}25`,
                borderColor: `${accentColor}50`,
                color: accentColor,
              }}
            >
              {catObj?.badgeIcon ? `${catObj.badgeIcon} ` : ""}
              {catName}
            </span>
          </div>

          {isVideo && (
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-500/30 backdrop-blur-md text-blue-300 border border-blue-400/40 flex items-center gap-1.5 shadow-lg">
              <Play className="size-3 fill-current" /> Video Stream
            </span>
          )}
        </div>

        {/* Center Hover Action Button (Click to Open) */}
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <button
            type="button"
            onClick={handleActionClick}
            className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-90 group-hover:scale-100 size-16 sm:size-20 rounded-full flex items-center justify-center text-black font-bold shadow-2xl backdrop-blur-md hover:scale-110 active:scale-95"
            style={{ backgroundColor: accentColor }}
            aria-label={isVideo ? "Watch Video Reel" : "View Full Portfolio Photos"}
          >
            {isVideo ? (
              <Play className="size-7 sm:size-8 ml-1 fill-black" />
            ) : (
              <Eye className="size-7 sm:size-8" />
            )}
          </button>
        </div>

        {/* Left & Right Navigation Arrows */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prevSlide();
              }}
              className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 z-30 size-11 sm:size-13 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md text-white border border-white/10 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 shadow-xl"
              aria-label="Previous showcase slide"
            >
              <ChevronLeft className="size-6 text-white" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                nextSlide();
              }}
              className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 z-30 size-11 sm:size-13 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md text-white border border-white/10 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 shadow-xl"
              aria-label="Next showcase slide"
            >
              <ChevronRight className="size-6 text-white" />
            </button>
          </>
        )}

        {/* Bottom Slide Info & Call-To-Action */}
        <div className="absolute bottom-0 inset-x-0 z-30 p-6 sm:p-8 md:p-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl text-left">
            <span className="text-xs sm:text-sm font-mono text-zinc-300 block drop-shadow">
              Client: <strong className="text-white">{currentItem.clientName}</strong>
            </span>

            <h2 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-lg line-clamp-2 leading-tight">
              {currentItem.title}
            </h2>

            {currentItem.servicePackage && (
              <div className="inline-flex items-center gap-2 text-xs font-mono text-zinc-300 pt-1">
                <span>Featured Package:</span>
                <span
                  className="font-bold underline decoration-amber-500/50 underline-offset-4"
                  style={{ color: accentColor }}
                >
                  {currentItem.servicePackage.name} (${currentItem.servicePackage.price.toLocaleString()})
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0 self-start sm:self-end">
            <button
              type="button"
              onClick={handleActionClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold text-black transition-all duration-200 shadow-xl hover:scale-105 active:scale-95"
              style={{ backgroundColor: accentColor }}
            >
              {isVideo ? (
                <>
                  <Play className="size-4 fill-black" />
                  <span>Watch Reel</span>
                </>
              ) : (
                <>
                  <Eye className="size-4" />
                  <span>View Photos</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Bottom Slide Progress Bar */}
        {total > 1 && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10 z-40 overflow-hidden">
            <div
              className="h-full transition-[width] duration-75 ease-linear"
              style={{
                width: `${progress}%`,
                backgroundColor: accentColor,
              }}
            />
          </div>
        )}
      </div>

      {/* Slide Thumbnails Dots Strip */}
      {total > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
          {items.map((item, index) => {
            const isActive = index === currentIndex;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goToSlide(index)}
                aria-label={`Go to slide ${index + 1}: ${item.title}`}
                className={`group relative rounded-xl overflow-hidden transition-all duration-300 ${
                  isActive
                    ? "w-16 sm:w-20 h-10 sm:h-12 border-2 ring-2 shadow-lg"
                    : "w-8 sm:w-10 h-8 sm:h-10 border border-zinc-800 opacity-50 hover:opacity-100"
                }`}
                style={{
                  borderColor: isActive ? accentColor : undefined,
                  boxShadow: isActive ? `0 0 15px ${accentColor}40` : undefined,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.coverImageUrl}
                  alt=""
                  className="size-full object-cover transition-transform group-hover:scale-110"
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

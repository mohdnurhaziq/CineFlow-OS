"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Eye,
  Camera,
  Film,
  Layers,
} from "lucide-react";
import type { ShowcasePortfolioItem } from "./portfolio-grid";
import type { LightboxItem } from "./media-lightbox-modal";
import type { VideoItem } from "./video-reel-modal";
import { categoryName } from "@/lib/bookings/category-name";
import { disciplineLabel } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { SHOWCASE_PLACEHOLDER, showcaseCover } from "@/lib/showcase/cover";

interface ShowcaseBigSliderProps {
  items: ShowcasePortfolioItem[];
  onOpenLightbox: (item: LightboxItem) => void;
  onOpenVideo: (item: VideoItem) => void;
  brandColor?: string | null;
  categories?: ReadonlyArray<{ slug: string; name: string; badgeIcon?: string | null }>;
  /** The studio's currency, for the featured package's price. */
  currency: string;
}

interface SlideItem {
  key: string;
  imageUrl: string;
  title: string;
  clientName: string;
  category: string;
  discipline: string;
  videoEmbedUrl?: string | null;
  servicePackage?: ShowcasePortfolioItem["servicePackage"];
  photoIndex: number;
  totalProjectPhotos: number;
  originalItem: ShowcasePortfolioItem;
}

const AUTO_SLIDE_INTERVAL = 4000; // 4 seconds per slide

function parseGalleryUrls(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string" && Boolean(x));
    }
  } catch {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/** Slide text and badges start where the page's content starts, however wide the screen. */
const EDGE = "px-5 sm:px-8 lg:px-[max(2rem,calc((100%-80rem)/2+2rem))]";

export function ShowcaseBigSlider({
  items,
  onOpenLightbox,
  onOpenVideo,
  brandColor = "#f59e0b",
  categories = [],
  currency,
}: ShowcaseBigSliderProps) {
  const accentColor = brandColor || "#f59e0b";
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchMove, setTouchMove] = useState<number | null>(null);

  // Flatten showcase items into individual slide photos (including gallery photos if present)
  const slides: SlideItem[] = useMemo(() => {
    const result: SlideItem[] = [];

    for (const item of items) {
      const gallery = parseGalleryUrls(item.galleryImages);
      // A missing cover is skipped when the item has gallery photos; with none, the placeholder shows.
      const cover = showcaseCover(item.coverImageUrl);
      const photos = Array.from(new Set([cover === SHOWCASE_PLACEHOLDER ? "" : cover, ...gallery].filter(Boolean)));
      const allPhotos = photos.length > 0 ? photos : [SHOWCASE_PLACEHOLDER];
      const count = allPhotos.length;

      allPhotos.forEach((photoUrl, idx) => {
        result.push({
          key: `${item.id}-${idx}`,
          imageUrl: photoUrl,
          title: item.title,
          clientName: item.clientName,
          category: item.category,
          discipline: item.discipline,
          videoEmbedUrl: idx === 0 ? item.videoEmbedUrl : null,
          servicePackage: item.servicePackage,
          photoIndex: idx + 1,
          totalProjectPhotos: count,
          originalItem: item,
        });
      });
    }

    return result;
  }, [items]);

  const total = slides.length;

  const nextSlide = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prevSlide = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  // Continuous auto-slide timer (every 4 seconds)
  useEffect(() => {
    if (total <= 1 || !isPlaying) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % total);
    }, AUTO_SLIDE_INTERVAL);

    return () => clearInterval(timer);
  }, [total, isPlaying]);

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

  const currentSlide = slides[currentIndex]!;
  const isVideo = Boolean(
    currentSlide.videoEmbedUrl || currentSlide.discipline === "VIDEOGRAPHY"
  );
  const catName = categoryName(categories, currentSlide.category);
  const catObj = categories.find((c) => c.slug === currentSlide.category);

  // Touch swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0]!.clientX);
    setTouchMove(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchMove(e.touches[0]!.clientX);
  };

  const handleTouchEnd = () => {
    if (touchStart === null || touchMove === null) return;
    const diff = touchStart - touchMove;
    if (diff > 50) nextSlide();
    else if (diff < -50) prevSlide();
    setTouchStart(null);
    setTouchMove(null);
  };

  const handleActionClick = () => {
    if (isVideo && currentSlide.originalItem.videoEmbedUrl) {
      onOpenVideo(currentSlide.originalItem);
    } else {
      // Pass lightbox with the clicked photo as cover
      onOpenLightbox({
        id: currentSlide.originalItem.id,
        title: currentSlide.title,
        clientName: currentSlide.clientName,
        category: currentSlide.category,
        coverImageUrl: currentSlide.imageUrl,
        discipline: currentSlide.discipline,
        galleryImages: currentSlide.originalItem.galleryImages,
      });
    }
  };

  return (
    <section aria-label="Auto-sliding Portfolio Showcase" className="border-b border-zinc-800/60">
      {/* Main Big Slider Container with Overflow Hidden */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="group relative w-full h-[calc(100svh-8rem)] min-h-[420px] max-h-[75svh] sm:max-h-[900px] overflow-hidden bg-[#0b0b0e] select-none"
      >
        {/* Horizontal Sliding Track: Translates -100% per slide */}
        <div
          className="flex h-full w-full transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {slides.map((slide, idx) => (
            <div
              key={slide.key}
              className="relative w-full h-full shrink-0 overflow-hidden bg-zinc-950 flex items-center justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.imageUrl}
                alt={slide.title}
                className="size-full object-cover"
                loading={idx === 0 ? "eager" : "lazy"}
              />
            </div>
          ))}
        </div>

        {/* Cinematic Vignette & Shadows Overlay */}
        <div className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-t from-black/95 via-black/25 to-black/50" />

        {/* Ambient Brand Color Tint */}
        <div
          className="absolute inset-0 z-20 pointer-events-none opacity-20 mix-blend-overlay"
          style={{
            background: `radial-gradient(circle at 75% 25%, ${accentColor} 0%, transparent 60%)`,
          }}
        />

        {/* Top Badges */}
        <div className={`absolute top-5 inset-x-0 z-30 flex items-center justify-between flex-wrap gap-2 pointer-events-none ${EDGE}`}>
          <div className="flex items-center gap-2 pointer-events-auto">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-black/70 backdrop-blur-md text-white border border-white/10 flex items-center gap-1.5 shadow-lg">
              {currentSlide.discipline === "VIDEOGRAPHY" ? (
                <Film className="size-3.5 text-cyan-400" />
              ) : currentSlide.discipline === "PHOTOGRAPHY" ? (
                <Camera className="size-3.5 text-amber-400" />
              ) : (
                <Layers className="size-3.5 text-amber-400" />
              )}
              <span>{disciplineLabel(currentSlide.discipline)}</span>
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

            {currentSlide.totalProjectPhotos > 1 && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-black/60 backdrop-blur-md text-zinc-300 border border-white/10">
                Photo {currentSlide.photoIndex} of {currentSlide.totalProjectPhotos}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            {isVideo && (
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-500/30 backdrop-blur-md text-blue-300 border border-blue-400/40 flex items-center gap-1.5 shadow-lg">
                <Play className="size-3 fill-current" /> Video Stream
              </span>
            )}
            {total > 1 && (
              <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 py-1 pl-3 pr-1 text-xs font-mono text-zinc-300 backdrop-blur-md">
                <span>
                  <strong className="text-white">{String(currentIndex + 1).padStart(2, "0")}</strong> / {String(total).padStart(2, "0")}
                </span>
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="rounded-full p-1.5 text-zinc-300 transition-colors hover:text-white"
                  title={isPlaying ? "Pause auto-slide" : "Play auto-slide"}
                  aria-label={isPlaying ? "Pause auto-slide" : "Play auto-slide"}
                >
                  {isPlaying ? <Pause className="size-3.5 text-amber-400" /> : <Play className="size-3.5 fill-amber-400 text-amber-400" />}
                </button>
              </span>
            )}
          </div>
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
              className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 z-30 size-11 sm:size-13 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md text-white border border-white/15 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 shadow-xl"
              aria-label="Previous showcase photo"
            >
              <ChevronLeft className="size-6 text-white" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                nextSlide();
              }}
              className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 z-30 size-11 sm:size-13 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md text-white border border-white/15 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 shadow-xl"
              aria-label="Next showcase photo"
            >
              <ChevronRight className="size-6 text-white" />
            </button>
          </>
        )}

        {/* Bottom Slide Info & Call-To-Action */}
        <div className={`absolute bottom-0 inset-x-0 z-30 py-6 sm:py-8 md:py-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4 ${EDGE}`}>
          <div className="space-y-2 max-w-2xl text-left">
            <span className="text-xs sm:text-sm font-mono text-zinc-300 block drop-shadow">
              Client: <strong className="text-white">{currentSlide.clientName}</strong>
            </span>

            <h2 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-lg line-clamp-2 leading-tight">
              {currentSlide.title}
            </h2>

            {currentSlide.servicePackage && (
              <div className="inline-flex items-center gap-2 text-xs font-mono text-zinc-300 pt-1">
                <span>Featured Package:</span>
                <span
                  className="font-bold underline decoration-amber-500/50 underline-offset-4"
                  style={{ color: accentColor }}
                >
                  {currentSlide.servicePackage.name} ({formatMoney(currency, currentSlide.servicePackage.price)})
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

        {/* Bottom Slide Progress Line */}
        {total > 1 && isPlaying && (
          <div
            key={currentIndex}
            className="absolute bottom-0 inset-x-0 h-1 bg-white/10 z-40 overflow-hidden"
          >
            <div
              className="h-full origin-left"
              style={{
                backgroundColor: accentColor,
                animation: "slideProgress 4s linear forwards",
              }}
            />
          </div>
        )}
      </div>

      {/* Slide Thumbnails Filmstrip Strip */}
      {total > 1 && (
        <div className="flex h-16 items-center justify-center gap-2 overflow-x-auto px-4">
          {slides.map((slide, index) => {
            const isActive = index === currentIndex;

            return (
              <button
                key={slide.key}
                type="button"
                onClick={() => goToSlide(index)}
                aria-label={`Slide ${index + 1}: ${slide.title}`}
                className={`group relative rounded-xl overflow-hidden transition-all duration-300 ${
                  isActive
                    ? "w-16 sm:w-20 h-10 sm:h-12 border-2 ring-2 shadow-lg scale-105"
                    : "w-9 sm:w-12 h-9 sm:h-12 border border-zinc-800 opacity-50 hover:opacity-100"
                }`}
                style={{
                  borderColor: isActive ? accentColor : undefined,
                  boxShadow: isActive ? `0 0 15px ${accentColor}40` : undefined,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.imageUrl}
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

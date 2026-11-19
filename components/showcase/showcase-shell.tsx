"use client";

import { useState, useMemo } from "react";
import { CategoryFilterBar } from "./category-filter-bar";
import { PortfolioGrid, type ShowcasePortfolioItem } from "./portfolio-grid";
import { ShowcaseBigSlider } from "./showcase-big-slider";
import { PackageGrid, type ServicePackageItem } from "./package-grid";
import { MediaLightboxModal, type LightboxItem } from "./media-lightbox-modal";
import { VideoReelModal, type VideoItem } from "./video-reel-modal";

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  currency: string;
  brandColor?: string | null;
  discipline: string;
}

interface CategoryInfo {
  id: string;
  name: string;
  slug: string;
  badgeIcon?: string | null;
  description?: string | null;
}

interface ShowcaseShellProps {
  tenant: TenantInfo;
  categories: CategoryInfo[];
  packages: ServicePackageItem[];
  showcaseItems: ShowcasePortfolioItem[];
  initialCategory?: string;
}

export function ShowcaseShell({
  tenant,
  categories,
  packages,
  showcaseItems,
  initialCategory = "all",
}: ShowcaseShellProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [activeLightboxItem, setActiveLightboxItem] = useState<LightboxItem | null>(null);
  const [activeVideoItem, setActiveVideoItem] = useState<VideoItem | null>(null);

  // Compute item counts per category slug
  const counts = useMemo(() => {
    const acc: Record<string, number> = {
      all: showcaseItems.length,
    };

    for (const item of showcaseItems) {
      acc[item.category] = (acc[item.category] || 0) + 1;
    }

    return acc;
  }, [showcaseItems]);

  // Filter showcase portfolio items
  const filteredItems = useMemo(() => {
    if (selectedCategory === "all") return showcaseItems;
    return showcaseItems.filter((item) => item.category === selectedCategory);
  }, [showcaseItems, selectedCategory]);

  // Filter service packages
  const filteredPackages = useMemo(() => {
    if (selectedCategory === "all") return packages;
    return packages.filter((pkg) => pkg.category === selectedCategory);
  }, [packages, selectedCategory]);

  // Featured & top works for the Big Hero Showcase Slider
  const sliderItems = useMemo(() => {
    if (showcaseItems.length === 0) return [];
    const featured = showcaseItems.filter((i) => i.isFeatured);
    if (featured.length >= 3) return featured;
    const nonFeatured = showcaseItems.filter((i) => !i.isFeatured);
    return [...featured, ...nonFeatured].slice(0, 8);
  }, [showcaseItems]);

  // A studio with no portfolio yet: the filter still narrows packages, but there is no gallery to show.
  const hasWorks = showcaseItems.length > 0;

  return (
    <div className="space-y-16">
      {/* Big Cinematic Showcase Photo Slider */}
      {hasWorks && sliderItems.length > 0 && (
        <ShowcaseBigSlider
          items={sliderItems}
          onOpenLightbox={setActiveLightboxItem}
          onOpenVideo={setActiveVideoItem}
          brandColor={tenant.brandColor}
          categories={categories}
        />
      )}

      {/* Category Filter Pills Bar & Gallery Catalog */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
            Explore by category
          </span>
          {hasWorks && (
            <span className="text-xs font-mono text-zinc-400">
              Showing {filteredItems.length} work{filteredItems.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <CategoryFilterBar
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          brandColor={tenant.brandColor}
          counts={hasWorks ? counts : undefined}
        />

        {/* Responsive Portfolio Gallery */}
        {hasWorks && (
          <PortfolioGrid
            items={filteredItems}
            onOpenLightbox={setActiveLightboxItem}
            onOpenVideo={setActiveVideoItem}
            brandColor={tenant.brandColor}
            categories={categories}
          />
        )}
      </div>

      {/* Filtered Packages Section */}
      <PackageGrid
        packages={filteredPackages}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        brandColor={tenant.brandColor}
      />

      {/* Lightbox Photo Modal */}
      <MediaLightboxModal
        item={activeLightboxItem}
        onClose={() => setActiveLightboxItem(null)}
        brandColor={tenant.brandColor}
      />

      {/* Cinema 16:9 Video Reel Modal */}
      <VideoReelModal
        item={activeVideoItem}
        onClose={() => setActiveVideoItem(null)}
        brandColor={tenant.brandColor}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Plus,
  Search,
  Filter,
  ExternalLink,
  Edit2,
  Trash2,
  Star,
  Film,
  Camera,
  Layers,
  Video,
  Eye,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  deleteShowcaseItem,
  toggleShowcaseFeatured,
} from "@/lib/actions/admin-cms";
import {
  ShowcaseItemDialog,
  type ShowcaseItemRow,
  type CategoryOption,
  type PackageOption,
} from "./showcase-item-dialog";

interface CmsManagerProps {
  tenantId: string;
  tenantSlug: string;
  initialItems: ShowcaseItemRow[];
  categories: CategoryOption[];
  packages: PackageOption[];
}

export function CmsManager({
  tenantId,
  tenantSlug,
  initialItems,
  categories,
  packages,
}: CmsManagerProps) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>("ALL");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<ShowcaseItemRow | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSuccess = () => {
    router.refresh();
  };

  const handleDelete = async (item: ShowcaseItemRow) => {
    if (!confirm(`Delete showcase item "${item.title}"?`)) return;

    setDeletingId(item.id);
    setErrorMessage(null);

    try {
      const res = await deleteShowcaseItem({
        id: item.id,
        tenantId,
        tenantSlug,
      });

      if (!res.success) {
        setErrorMessage(res.message || "Failed to delete showcase item.");
      } else {
        handleSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleFeatured = async (item: ShowcaseItemRow) => {
    try {
      await toggleShowcaseFeatured({
        id: item.id,
        tenantId,
        tenantSlug,
        isFeatured: !item.isFeatured,
      });
      handleSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to toggle featured status.");
    }
  };

  // KPI Calculations
  const totalItems = initialItems.length;
  const featuredItems = initialItems.filter((i) => i.isFeatured).length;
  const videoItems = initialItems.filter((i) => !!i.videoEmbedUrl).length;
  const photoItems = initialItems.filter((i) => !i.videoEmbedUrl).length;

  // Filter items
  const filteredItems = initialItems.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.clientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "ALL" || item.category === selectedCategory;
    const matchesDiscipline =
      selectedDiscipline === "ALL" || item.discipline === selectedDiscipline;

    return matchesSearch && matchesCategory && matchesDiscipline;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Sparkles className="size-6 text-amber-400" />
            <span>Showcase Portfolio CMS</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Curate brand campaign stories, cinematic reels, client spotlights, and public gallery placements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/${tenantSlug}`}
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono text-zinc-300 bg-zinc-900 border border-zinc-700 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <Eye className="size-3.5" />
            <span>View Public Showcase</span>
            <ExternalLink className="size-3 text-amber-400" />
          </Link>

          <button
            type="button"
            onClick={() => {
              setItemToEdit(null);
              setIsDialogOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/10"
          >
            <Plus className="size-4" />
            <span>New Portfolio Item</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
            Portfolio Items
          </span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block">
            {totalItems}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Total showcases</span>
        </div>

        <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5">
          <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider block flex items-center gap-1">
            <Star className="size-3 fill-amber-400" /> Featured Spotlights
          </span>
          <span className="text-2xl font-bold font-mono text-amber-400 mt-1 block">
            {featuredItems}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Pinned on public landing</span>
        </div>

        <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5">
          <span className="text-[11px] font-mono text-blue-400 uppercase tracking-wider block flex items-center gap-1">
            <Video className="size-3" /> Video Showcases
          </span>
          <span className="text-2xl font-bold font-mono text-blue-400 mt-1 block">
            {videoItems}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">With embed stream URL</span>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block flex items-center gap-1">
            <Camera className="size-3" /> Editorial Stills
          </span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block">
            {photoItems}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">High-res stills gallery</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search portfolio by title, brand, or client name..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.badgeIcon ? `${c.badgeIcon} ` : ""}{c.name}
              </option>
            ))}
          </select>

          <select
            value={selectedDiscipline}
            onChange={(e) => setSelectedDiscipline(e.target.value)}
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="ALL">All Disciplines</option>
            <option value="PHOTOGRAPHY">Photography</option>
            <option value="VIDEOGRAPHY">Videography</option>
            <option value="HYBRID">Hybrid</option>
          </select>

          {(searchQuery || selectedCategory !== "ALL" || selectedDiscipline !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("ALL");
                setSelectedDiscipline("ALL");
              }}
              className="text-xs font-mono text-amber-400 hover:underline px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Grid of Portfolio Showcases */}
      {filteredItems.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <p className="text-sm text-zinc-400">No showcase items match your filter criteria.</p>
          <p className="text-xs text-zinc-400 mt-1">Publish portfolio work to attract new production clients.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const catObj = categories.find((c) => c.slug === item.category);
            const pkgObj = packages.find((p) => p.id === item.servicePackageId);

            return (
              <div
                key={item.id}
                className={`rounded-2xl border overflow-hidden flex flex-col justify-between transition-all ${
                  item.isFeatured
                    ? "bg-[#111115] border-amber-500/30 shadow-lg shadow-amber-500/5"
                    : "bg-[#0d0d10] border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {/* Media Preview Box */}
                <div className="relative aspect-video bg-zinc-900 overflow-hidden flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform hover:scale-105 duration-300"
                    style={{ backgroundImage: `url(${item.coverImageUrl})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Top Badges */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-black/60 backdrop-blur-md text-white border border-white/10 flex items-center gap-1">
                      {item.discipline === "VIDEOGRAPHY" ? (
                        <Film className="size-3 text-amber-400" />
                      ) : item.discipline === "PHOTOGRAPHY" ? (
                        <Camera className="size-3 text-amber-400" />
                      ) : (
                        <Layers className="size-3 text-amber-400" />
                      )}
                      {item.discipline}
                    </span>

                    {item.videoEmbedUrl && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/30 backdrop-blur-md text-blue-300 border border-blue-400/30 flex items-center gap-1">
                        <Video className="size-3" /> Reel
                      </span>
                    )}
                  </div>

                  {/* Star Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleFeatured(item)}
                    className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white hover:scale-110 transition-transform"
                    title={item.isFeatured ? "Featured Spotlight" : "Click to Feature"}
                  >
                    <Star
                      className={`size-3.5 ${
                        item.isFeatured ? "text-amber-400 fill-amber-400" : "text-zinc-400"
                      }`}
                    />
                  </button>

                  {/* Bottom Image Overlay Text */}
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 text-left">
                    <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">
                      {catObj?.badgeIcon ? `${catObj.badgeIcon} ` : ""}
                      {catObj?.name || item.category}
                    </span>
                    <h3 className="text-sm font-bold text-white tracking-tight truncate drop-shadow">
                      {item.title}
                    </h3>
                  </div>
                </div>

                {/* Card Details & Actions */}
                <div className="p-4 flex flex-col justify-between flex-1 space-y-3">
                  <div>
                    <div className="text-xs text-zinc-400">
                      Client: <span className="font-medium text-white">{item.clientName}</span>
                    </div>

                    {pkgObj && (
                      <div className="text-[11px] text-zinc-500 mt-1 truncate">
                        Linked: {pkgObj.name}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
                    <span className="text-[10px] font-mono text-zinc-400">
                      Sort: {item.sortOrder}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setItemToEdit(item);
                          setIsDialogOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Edit Item"
                      >
                        <Edit2 className="size-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.id}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        title="Delete Item"
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog Modal */}
      <ShowcaseItemDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        categories={categories}
        packages={packages}
        itemToEdit={itemToEdit}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

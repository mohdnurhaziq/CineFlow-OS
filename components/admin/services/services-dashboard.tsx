"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  Layers,
  Plus,
  Search,
  Filter,
  Sparkles,
  Clock,
  CheckCircle2,
  Edit2,
  Trash2,
  Star,
  Film,
  Camera,
  Layers as LayersIcon,
  Loader2,
} from "lucide-react";
import { deleteServicePackage, togglePackageFeatured } from "@/lib/actions/admin-services";
import { PackageDialog, type PackageRow, type CategoryOption } from "./package-dialog";
import { CategoryDialog, type CategoryRow } from "./category-dialog";
import { CategoryList } from "./category-list";

interface ServicesDashboardProps {
  tenantId: string;
  tenantSlug: string;
  currency: string;
  initialPackages: PackageRow[];
  initialCategories: CategoryRow[];
}

export function ServicesDashboard({
  tenantId,
  tenantSlug,
  currency,
  initialPackages,
  initialCategories,
}: ServicesDashboardProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"packages" | "categories">("packages");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // Dialog states
  const [isPackageDialogOpen, setIsPackageDialogOpen] = useState(false);
  const [packageToEdit, setPackageToEdit] = useState<PackageRow | null>(null);

  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<CategoryRow | null>(null);

  const [deletingPackageId, setDeletingPackageId] = useState<string | null>(null);

  // Quick refresh
  const handleSuccess = () => {
    router.refresh();
  };

  // Filter packages
  const filteredPackages = initialPackages.filter((pkg) => {
    const matchesSearch =
      pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.deliverables.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDiscipline =
      selectedDiscipline === "ALL" || pkg.discipline === selectedDiscipline;
    const matchesCategory =
      selectedCategory === "ALL" || pkg.category === selectedCategory;
    return matchesSearch && matchesDiscipline && matchesCategory;
  });

  // KPI Calculations
  const totalPackages = initialPackages.length;
  const featuredPackages = initialPackages.filter((p) => p.isFeatured).length;
  const totalCategories = initialCategories.length;
  const activeCategories = initialCategories.filter((c) => c.isActive).length;

  const handleDeletePackage = async (pkg: PackageRow) => {
    if (!confirm(`Are you sure you want to delete package "${pkg.name}"?`)) return;

    setDeletingPackageId(pkg.id);
    try {
      const res = await deleteServicePackage({
        id: pkg.id,
        tenantId,
        tenantSlug,
      });
      if (res.success) {
        handleSuccess();
      } else {
        alert(res.message || "Failed to delete package.");
      }
    } finally {
      setDeletingPackageId(null);
    }
  };

  const handleToggleFeatured = async (pkg: PackageRow) => {
    await togglePackageFeatured({
      id: pkg.id,
      tenantId,
      tenantSlug,
      isFeatured: !pkg.isFeatured,
    });
    handleSuccess();
  };

  const formatPrice = (val: number) => {
    return `${currency === "MYR" ? "RM" : "$"}${val.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Package className="size-6 text-amber-400" />
            <span>Service Packages & Campaign Categories</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Configure studio pricing tiers, turnaround expectations, deliverables scope, and public booking classifications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "packages" ? (
            <button
              type="button"
              onClick={() => {
                setPackageToEdit(null);
                setIsPackageDialogOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/10"
            >
              <Plus className="size-4" />
              <span>New Package</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCategoryToEdit(null);
                setIsCategoryDialogOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/10"
            >
              <Plus className="size-4" />
              <span>New Category</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Metrics Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
            Total Packages
          </span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block">
            {totalPackages}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Configured offerings</span>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
            Featured Packages
          </span>
          <span className="text-2xl font-bold font-mono text-amber-400 mt-1 block">
            {featuredPackages}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Showcased on home</span>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
            Campaign Categories
          </span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block">
            {totalCategories}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Classification tags</span>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
            Active Categories
          </span>
          <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
            {activeCategories}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Visible to clients</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-zinc-800">
        <button
          type="button"
          onClick={() => setActiveTab("packages")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-medium border-b-2 transition-colors ${
            activeTab === "packages"
              ? "border-amber-400 text-amber-400 bg-amber-500/5"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <Package className="size-4" />
          <span>Service Packages ({initialPackages.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("categories")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-medium border-b-2 transition-colors ${
            activeTab === "categories"
              ? "border-amber-400 text-amber-400 bg-amber-500/5"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <Layers className="size-4" />
          <span>Campaign Categories ({initialCategories.length})</span>
        </button>
      </div>

      {/* Tab 1: Service Packages View */}
      {activeTab === "packages" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search packages by title, deliverables, or keywords..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2">
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

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors"
              >
                <option value="ALL">All Categories</option>
                {initialCategories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.badgeIcon ? `${c.badgeIcon} ` : ""}{c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Packages Grid */}
          {filteredPackages.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-zinc-800 bg-[#0d0d10]">
              <p className="text-sm text-zinc-400">No service packages match your filter criteria.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedDiscipline("ALL");
                  setSelectedCategory("ALL");
                }}
                className="mt-2 text-xs font-mono text-amber-400 hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPackages.map((pkg) => {
                const categoryObj = initialCategories.find((c) => c.slug === pkg.category);
                return (
                  <div
                    key={pkg.id}
                    className={`relative rounded-2xl border p-5 flex flex-col justify-between transition-all ${
                      pkg.isFeatured
                        ? "bg-[#111115] border-amber-500/30 shadow-lg shadow-amber-500/5"
                        : "bg-[#0d0d10] border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div>
                      {/* Top Badges & Actions */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1">
                            {pkg.discipline === "VIDEOGRAPHY" ? (
                              <Film className="size-3 text-amber-400" />
                            ) : pkg.discipline === "PHOTOGRAPHY" ? (
                              <Camera className="size-3 text-amber-400" />
                            ) : (
                              <LayersIcon className="size-3 text-amber-400" />
                            )}
                            {pkg.discipline}
                          </span>

                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {categoryObj?.badgeIcon ? `${categoryObj.badgeIcon} ` : ""}
                            {categoryObj?.name || pkg.category}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleFeatured(pkg)}
                            title={pkg.isFeatured ? "Remove from featured" : "Mark as featured"}
                            className={`p-1.5 rounded-lg transition-colors ${
                              pkg.isFeatured
                                ? "text-amber-400 hover:bg-amber-500/20"
                                : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800"
                            }`}
                          >
                            <Star className={`size-3.5 ${pkg.isFeatured ? "fill-amber-400" : ""}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPackageToEdit(pkg);
                              setIsPackageDialogOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            title="Edit Package"
                          >
                            <Edit2 className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePackage(pkg)}
                            disabled={deletingPackageId === pkg.id}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            title="Delete Package"
                          >
                            {deletingPackageId === pkg.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Package Name */}
                      <h3 className="text-base font-bold text-white tracking-tight mb-1">
                        {pkg.name}
                      </h3>

                      {/* Pricing */}
                      <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-xl font-bold font-mono text-amber-400">
                          {formatPrice(pkg.price)}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-400">
                          (Deposit: {formatPrice(pkg.depositPrice)})
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-zinc-400 line-clamp-2 mb-3">
                        {pkg.description}
                      </p>

                      {/* Deliverables Scope */}
                      <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-300 space-y-1 mb-3">
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
                          Deliverables
                        </span>
                        <p className="line-clamp-2 text-zinc-300">{pkg.deliverables}</p>
                      </div>
                    </div>

                    {/* Footer turnaround */}
                    <div className="pt-3 border-t border-zinc-800/60 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3 text-amber-400" />
                        {pkg.turnaround}
                      </span>
                      {pkg.isFeatured && (
                        <span className="flex items-center gap-1 text-amber-400/90">
                          <Sparkles className="size-3" /> Featured
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Campaign Categories View */}
      {activeTab === "categories" && (
        <CategoryList
          categories={initialCategories}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          onEdit={(cat) => {
            setCategoryToEdit(cat);
            setIsCategoryDialogOpen(true);
          }}
          onSuccess={handleSuccess}
        />
      )}

      {/* Modals */}
      <PackageDialog
        isOpen={isPackageDialogOpen}
        onClose={() => setIsPackageDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        currency={currency}
        categories={initialCategories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          badgeIcon: c.badgeIcon,
        }))}
        packageToEdit={packageToEdit}
        onSuccess={handleSuccess}
      />

      <CategoryDialog
        isOpen={isCategoryDialogOpen}
        onClose={() => setIsCategoryDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        categoryToEdit={categoryToEdit}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

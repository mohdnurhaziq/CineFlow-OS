"use client";

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  badgeIcon?: string | null;
  description?: string | null;
}

interface CategoryFilterBarProps {
  categories: CategoryItem[];
  selectedCategory: string;
  onSelectCategory: (slug: string) => void;
  brandColor?: string | null;
  counts?: Record<string, number>;
}

export function CategoryFilterBar({
  categories,
  selectedCategory,
  onSelectCategory,
  brandColor,
  counts = {},
}: CategoryFilterBarProps) {
  const activeColor = brandColor || "#f59e0b";

  return (
    <div className="w-full overflow-x-auto pb-2 scrollbar-none">
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-max">
        {/* All Works Tab */}
        <button
          onClick={() => onSelectCategory("all")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-[0.97] border ${
            selectedCategory === "all"
              ? "bg-amber-500 text-black border-amber-500 shadow-md shadow-amber-500/20"
              : "bg-[#121215] text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700"
          }`}
          style={
            selectedCategory === "all"
              ? { backgroundColor: activeColor, borderColor: activeColor }
              : {}
          }
        >
          <span>✨ All Works</span>
          {counts["all"] !== undefined && (
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                selectedCategory === "all" ? "bg-black/20 text-black font-bold" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {counts["all"]}
            </span>
          )}
        </button>

        {/* Dynamic Categories */}
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.slug;
          const count = counts[cat.slug];

          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.slug)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-[0.97] border ${
                isSelected
                  ? "text-black font-bold shadow-md"
                  : "bg-[#121215] text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700"
              }`}
              style={
                isSelected
                  ? {
                      backgroundColor: activeColor,
                      borderColor: activeColor,
                      boxShadow: `0 4px 14px ${activeColor}30`,
                    }
                  : {}
              }
            >
              <span>{cat.badgeIcon || "📁"}</span>
              <span>{cat.name}</span>
              {count !== undefined && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    isSelected ? "bg-black/20 text-black font-bold" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

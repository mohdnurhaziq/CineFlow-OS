"use client";

import { useState } from "react";
import { Edit2, Trash2, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { deleteCampaignCategory, toggleCategoryActive } from "@/lib/actions/admin-services";
import type { CategoryRow } from "./category-dialog";

interface CategoryListProps {
  categories: CategoryRow[];
  tenantId: string;
  tenantSlug: string;
  onEdit: (category: CategoryRow) => void;
  onSuccess: () => void;
}

export function CategoryList({
  categories,
  tenantId,
  tenantSlug,
  onEdit,
  onSuccess,
}: CategoryListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDelete = async (cat: CategoryRow) => {
    if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;

    setDeletingId(cat.id);
    setErrorMessage(null);

    try {
      const res = await deleteCampaignCategory({
        id: cat.id,
        tenantId,
        tenantSlug,
      });

      if (!res.success) {
        setErrorMessage(res.message || "Failed to delete category.");
      } else {
        onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (cat: CategoryRow) => {
    try {
      await toggleCategoryActive({
        id: cat.id,
        tenantId,
        tenantSlug,
        isActive: !cat.isActive,
      });
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to toggle active status.");
    }
  };

  if (categories.length === 0) {
    return (
      <div className="p-8 text-center rounded-2xl border border-zinc-800 bg-[#0d0d10]">
        <p className="text-sm text-zinc-400">No campaign categories configured yet.</p>
        <p className="text-xs text-zinc-400 mt-1">Create categories to organize your service offerings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="text-[11px] font-mono uppercase bg-zinc-900/60 text-zinc-400 border-b border-zinc-800">
              <tr>
                <th scope="col" className="px-4 py-3">Category</th>
                <th scope="col" className="px-4 py-3">Slug</th>
                <th scope="col" className="px-4 py-3">Description</th>
                <th scope="col" className="px-4 py-3 text-center">Sort Order</th>
                <th scope="col" className="px-4 py-3 text-center">Status</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                    <span className="text-base">{cat.badgeIcon || "📸"}</span>
                    <span>{cat.name}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-amber-400/90">
                    {cat.slug}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400 max-w-xs truncate">
                    {cat.description || "—"}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs text-zinc-400">
                    {cat.sortOrder}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(cat)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono transition-colors"
                    >
                      {cat.isActive ? (
                        <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle className="size-3" /> Active
                        </span>
                      ) : (
                        <span className="text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <XCircle className="size-3" /> Inactive
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(cat)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Edit Category"
                      >
                        <Edit2 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(cat)}
                        disabled={deletingId === cat.id}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        title="Delete Category"
                      >
                        {deletingId === cat.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

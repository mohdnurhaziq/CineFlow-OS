"use client";

import { useState } from "react";
import {
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  deleteProposalAddOnTemplate,
  toggleAddOnTemplateDefault,
  toggleAddOnTemplateActive,
} from "@/lib/actions/admin-proposals";
import type { ProposalAddOnTemplateRow } from "./addon-template-dialog";

interface AddOnTemplateTableProps {
  templates: ProposalAddOnTemplateRow[];
  tenantId: string;
  tenantSlug: string;
  currency: string;
  onEdit: (template: ProposalAddOnTemplateRow) => void;
  onSuccess: () => void;
}

export function AddOnTemplateTable({
  templates,
  tenantId,
  tenantSlug,
  currency,
  onEdit,
  onSuccess,
}: AddOnTemplateTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDelete = async (t: ProposalAddOnTemplateRow) => {
    if (!confirm(`Are you sure you want to delete add-on "${t.name}"?`)) return;

    setDeletingId(t.id);
    setErrorMessage(null);

    try {
      const res = await deleteProposalAddOnTemplate({
        id: t.id,
        tenantId,
        tenantSlug,
      });

      if (!res.success) {
        setErrorMessage(res.message || "Failed to delete template.");
      } else {
        onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleDefault = async (t: ProposalAddOnTemplateRow) => {
    try {
      await toggleAddOnTemplateDefault({
        id: t.id,
        tenantId,
        tenantSlug,
        isDefault: !t.isDefault,
      });
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to toggle default.");
    }
  };

  const handleToggleActive = async (t: ProposalAddOnTemplateRow) => {
    try {
      await toggleAddOnTemplateActive({
        id: t.id,
        tenantId,
        tenantSlug,
        isActive: !t.isActive,
      });
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to toggle active.");
    }
  };

  const formatPrice = (val: number, unit: string) => {
    const formatted = `${currency === "MYR" ? "RM" : "$"}${val.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
    if (unit === "per_hour") return `${formatted} / hr`;
    if (unit === "per_day") return `${formatted} / day`;
    return formatted;
  };

  if (templates.length === 0) {
    return (
      <div className="p-8 text-center rounded-2xl border border-zinc-800 bg-[#0d0d10]">
        <p className="text-sm text-zinc-400">No proposal add-on templates created yet.</p>
        <p className="text-xs text-zinc-400 mt-1">Configure options like Drone 4K, 2nd Shooter, or RAW Delivery.</p>
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
                <th scope="col" className="px-4 py-3">Add-On Name</th>
                <th scope="col" className="px-4 py-3">Description</th>
                <th scope="col" className="px-4 py-3">Rate & Unit</th>
                <th scope="col" className="px-4 py-3 text-center">Default Flag</th>
                <th scope="col" className="px-4 py-3 text-center">Catalog Status</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">
                    <div className="font-bold">{t.name}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400 max-w-sm">
                    <p className="line-clamp-2">{t.description}</p>
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-amber-400 whitespace-nowrap">
                    {formatPrice(t.price, t.unit)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleDefault(t)}
                      className="inline-flex items-center gap-1 transition-colors"
                      title="Toggle auto-select default"
                    >
                      {t.isDefault ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <Sparkles className="size-3" /> Default
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700 hover:text-zinc-300">
                          Optional
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(t)}
                      className="inline-flex items-center gap-1 transition-colors"
                      title="Toggle active status"
                    >
                      {t.isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle className="size-3" /> Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700 flex items-center gap-1">
                          <XCircle className="size-3" /> Disabled
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(t)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Edit Add-On"
                      >
                        <Edit2 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(t)}
                        disabled={deletingId === t.id}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        title="Delete Add-On"
                      >
                        {deletingId === t.id ? (
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

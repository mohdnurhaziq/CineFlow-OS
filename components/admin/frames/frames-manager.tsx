"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Frame,
  Plus,
  ExternalLink,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Maximize2,
  Layers,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  deleteFrameDesign,
  toggleFrameAvailability,
  deletePrintSize,
} from "@/lib/actions/admin-frames";
import {
  FrameDesignDialog,
  type FrameDesignRow,
} from "./frame-design-dialog";
import {
  PrintSizeDialog,
  type PrintSizeRow,
} from "./print-size-dialog";

interface FramesManagerProps {
  tenantId: string;
  tenantSlug: string;
  currency: string;
  initialFrames: FrameDesignRow[];
  initialSizes: PrintSizeRow[];
}

export function FramesManager({
  tenantId,
  tenantSlug,
  currency,
  initialFrames,
  initialSizes,
}: FramesManagerProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"frames" | "sizes">("frames");

  // Dialogs
  const [isFrameDialogOpen, setIsFrameDialogOpen] = useState(false);
  const [frameToEdit, setFrameToEdit] = useState<FrameDesignRow | null>(null);

  const [isSizeDialogOpen, setIsSizeDialogOpen] = useState(false);
  const [sizeToEdit, setSizeToEdit] = useState<PrintSizeRow | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSuccess = () => {
    router.refresh();
  };

  const handleDeleteFrame = async (frame: FrameDesignRow) => {
    if (!confirm(`Delete frame molding "${frame.name}"?`)) return;

    setDeletingId(frame.id);
    setErrorMessage(null);

    try {
      const res = await deleteFrameDesign({
        id: frame.id,
        tenantId,
        tenantSlug,
      });

      if (!res.success) {
        setErrorMessage(res.message || "Failed to delete frame molding.");
      } else {
        handleSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleFrame = async (frame: FrameDesignRow) => {
    try {
      await toggleFrameAvailability({
        id: frame.id,
        tenantId,
        tenantSlug,
        isAvailable: !frame.isAvailable,
      });
      handleSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to toggle frame availability.");
    }
  };

  const handleDeleteSize = async (size: PrintSizeRow) => {
    if (!confirm(`Delete print dimension "${size.name}" (${size.code})?`)) return;

    setDeletingId(size.id);
    setErrorMessage(null);

    try {
      const res = await deletePrintSize({
        id: size.id,
        tenantId,
        tenantSlug,
      });

      if (!res.success) {
        setErrorMessage(res.message || "Failed to delete print size.");
      } else {
        handleSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setDeletingId(null);
    }
  };

  const formatPrice = (val: number) => {
    return `${currency === "MYR" ? "RM" : "$"}${val.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  };

  // KPI Calculations
  const totalFrames = initialFrames.length;
  const activeFrames = initialFrames.filter((f) => f.isAvailable).length;
  const totalSizes = initialSizes.length;
  const lowestPrice =
    initialSizes.length > 0
      ? Math.min(...initialSizes.map((s) => s.basePrice))
      : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Frame className="size-6 text-amber-400" />
            <span>Frame Moldings & Print Dimensions</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Configure physical print sizes, molding finishes, and real-scale rendering dimensions for the Wall Art Visualizer.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "frames" ? (
            <button
              type="button"
              onClick={() => {
                setFrameToEdit(null);
                setIsFrameDialogOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/10"
            >
              <Plus className="size-4" />
              <span>Add Frame Molding</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSizeToEdit(null);
                setIsSizeDialogOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/10"
            >
              <Plus className="size-4" />
              <span>Add Print Size</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Visualizer Banner */}
      <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Maximize2 className="size-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold font-mono text-amber-300 uppercase tracking-wide">
              Live Wall Art Visualizer Integration
            </h4>
            <p className="text-xs text-zinc-300 mt-0.5">
              Preview client scaling against the 84-inch living room sofa mockup in real-time.
            </p>
          </div>
        </div>

        <Link
          href={`/${tenantSlug}/visualizer`}
          target="_blank"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors shrink-0"
        >
          <span>Open Visualizer</span>
          <ExternalLink className="size-3.5" />
        </Link>
      </div>

      {/* KPI Metrics Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
            Frame Moldings
          </span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block">
            {totalFrames}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Configured finishes</span>
        </div>

        <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
          <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider block flex items-center gap-1">
            <CheckCircle className="size-3" /> Available Moldings
          </span>
          <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
            {activeFrames}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Active on visualizer</span>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
            Print Sizes
          </span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block">
            {totalSizes}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Aspect dimensions</span>
        </div>

        <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5">
          <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider block">
            Base Entry Price
          </span>
          <span className="text-2xl font-bold font-mono text-amber-400 mt-1 block">
            {formatPrice(lowestPrice)}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Starting print cost</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-zinc-800">
        <button
          type="button"
          onClick={() => setActiveTab("frames")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-medium border-b-2 transition-colors ${
            activeTab === "frames"
              ? "border-amber-400 text-amber-400 bg-amber-500/5"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <Frame className="size-4" />
          <span>Frame Moldings ({initialFrames.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("sizes")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-medium border-b-2 transition-colors ${
            activeTab === "sizes"
              ? "border-amber-400 text-amber-400 bg-amber-500/5"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <Layers className="size-4" />
          <span>Print Dimensions ({initialSizes.length})</span>
        </button>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Tab 1: Frame Moldings View */}
      {activeTab === "frames" && (
        <div className="space-y-4">
          {initialFrames.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-zinc-800 bg-[#0d0d10]">
              <p className="text-sm text-zinc-400">No frame moldings configured yet.</p>
              <p className="text-xs text-zinc-400 mt-1">Add Matte Black, Walnut Shadowbox, or Gold moldings.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="text-[11px] font-mono uppercase bg-zinc-900/60 text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th scope="col" className="px-4 py-3">Finish & Molding</th>
                      <th scope="col" className="px-4 py-3">Material</th>
                      <th scope="col" className="px-4 py-3">Width</th>
                      <th scope="col" className="px-4 py-3">Price Offset</th>
                      <th scope="col" className="px-4 py-3 text-center">Visualizer Status</th>
                      <th scope="col" className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {initialFrames.map((frame) => (
                      <tr key={frame.id} className="hover:bg-zinc-900/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="size-6 rounded border border-zinc-600 shrink-0 shadow-sm"
                              style={{ backgroundColor: frame.frameColor }}
                            />
                            <div>
                              <div className="font-bold text-white text-xs">{frame.name}</div>
                              <div className="text-[10px] font-mono text-zinc-400">{frame.frameColor}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-300">
                          {frame.material}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-zinc-300">
                          {frame.moldingWidth}"
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-amber-400">
                          {frame.priceOffset > 0 ? `+${formatPrice(frame.priceOffset)}` : "Included"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleFrame(frame)}
                            className="inline-flex items-center gap-1 transition-colors"
                          >
                            {frame.isAvailable ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1">
                                <CheckCircle className="size-3" /> Available
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700 flex items-center gap-1">
                                <XCircle className="size-3" /> Hidden
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setFrameToEdit(frame);
                                setIsFrameDialogOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                              title="Edit Frame"
                            >
                              <Edit2 className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFrame(frame)}
                              disabled={deletingId === frame.id}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                              title="Delete Frame"
                            >
                              {deletingId === frame.id ? (
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
          )}
        </div>
      )}

      {/* Tab 2: Print Dimensions View */}
      {activeTab === "sizes" && (
        <div className="space-y-4">
          {initialSizes.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-zinc-800 bg-[#0d0d10]">
              <p className="text-sm text-zinc-400">No print dimensions configured yet.</p>
              <p className="text-xs text-zinc-400 mt-1">Configure sizes like 8R, 12R, 16R, 20R, or 24R.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="text-[11px] font-mono uppercase bg-zinc-900/60 text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th scope="col" className="px-4 py-3">Code</th>
                      <th scope="col" className="px-4 py-3">Display Name</th>
                      <th scope="col" className="px-4 py-3">Dimensions (W x H)</th>
                      <th scope="col" className="px-4 py-3">Base Print Price</th>
                      <th scope="col" className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
                    {initialSizes.map((size) => (
                      <tr key={size.id} className="hover:bg-zinc-900/30 transition-colors">
                        <td className="px-4 py-3 font-bold text-amber-400">
                          <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                            {size.code}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-sans font-medium text-white">
                          {size.name}
                        </td>
                        <td className="px-4 py-3 text-zinc-300">
                          {size.widthInches}" × {size.heightInches}"
                        </td>
                        <td className="px-4 py-3 font-bold text-white">
                          {formatPrice(size.basePrice)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSizeToEdit(size);
                                setIsSizeDialogOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                              title="Edit Print Size"
                            >
                              <Edit2 className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSize(size)}
                              disabled={deletingId === size.id}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                              title="Delete Print Size"
                            >
                              {deletingId === size.id ? (
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
          )}
        </div>
      )}

      {/* Dialog Modals */}
      <FrameDesignDialog
        isOpen={isFrameDialogOpen}
        onClose={() => setIsFrameDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        currency={currency}
        frameToEdit={frameToEdit}
        onSuccess={handleSuccess}
      />

      <PrintSizeDialog
        isOpen={isSizeDialogOpen}
        onClose={() => setIsSizeDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        currency={currency}
        sizeToEdit={sizeToEdit}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

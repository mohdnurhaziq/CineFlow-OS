"use client";

import { useState, useEffect, useTransition } from "react";
import { X, Sparkles, Video, Loader2, Camera, Sun, Film } from "lucide-react";
import { useDialog } from "@/lib/use-dialog";
import { createShotItem, updateShotItem } from "@/lib/actions/logistics";
import { toast } from "sonner";
import type { ShotItemData } from "./shot-list-hud";

interface ShotDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  tenantSlug?: string;
  initialData?: ShotItemData | null;
  defaultSceneNumber?: string;
  onSaved: (shot: ShotItemData, isEdit: boolean) => void;
}

const FRAMING_PRESETS = [
  "Wide (WS)",
  "Medium (MS)",
  "Close-Up (CU)",
  "Extreme Close-Up (ECU)",
  "Over the Shoulder (OTS)",
  "Point of View (POV)",
  "Aerial / Drone",
];

const LENS_PRESETS = [
  "24-70mm f/2.8",
  "50mm f/1.2 Prime",
  "85mm f/1.4 Portrait",
  "16-35mm f/2.8 Wide",
  "70-200mm f/2.8 Telephoto",
  "35mm Anamorphic",
];

const LIGHTING_PRESETS = [
  "Natural Golden Hour",
  "Key Light + Softbox",
  "High-Key Studio Clean",
  "Moody Low-Key / Rim",
  "RGB Neon Accent",
  "Direct Sunlight + Reflector",
];

export function ShotDialog({
  isOpen,
  onClose,
  projectId,
  tenantSlug,
  initialData,
  defaultSceneNumber = "1",
  onSaved,
}: ShotDialogProps) {
  const dialog = useDialog(isOpen, onClose);
  const [isPending, startTransition] = useTransition();

  const [sceneNumber, setSceneNumber] = useState(defaultSceneNumber);
  const [shotNumber, setShotNumber] = useState("1");
  const [framing, setFraming] = useState("Medium (MS)");
  const [cameraLens, setCameraLens] = useState("50mm f/1.2 Prime");
  const [lightingSetup, setLightingSetup] = useState("Key Light + Softbox");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"PENDING" | "IN_PROGRESS" | "COMPLETED">("PENDING");

  // Sync state when dialog opens or initialData changes
  useEffect(() => {
    if (initialData) {
      setSceneNumber(String(initialData.sceneNumber));
      setShotNumber(String(initialData.shotNumber));
      setFraming(initialData.framing);
      setCameraLens(initialData.cameraLens);
      setLightingSetup(initialData.lightingSetup);
      setDescription(initialData.description);
      setStatus(initialData.status as "PENDING" | "IN_PROGRESS" | "COMPLETED");
    } else {
      setSceneNumber(defaultSceneNumber);
      setShotNumber("1");
      setFraming("Medium (MS)");
      setCameraLens("50mm f/1.2 Prime");
      setLightingSetup("Key Light + Softbox");
      setDescription("");
      setStatus("PENDING");
    }
  }, [initialData, defaultSceneNumber, isOpen]);

  if (!isOpen) return null;

  const isEdit = !!initialData;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("Please provide a description or action for the shot.");
      return;
    }

    startTransition(async () => {
      try {
        if (isEdit && initialData) {
          const res = await updateShotItem({
            shotId: initialData.id,
            tenantSlug,
            sceneNumber: sceneNumber.trim() || "1",
            shotNumber: shotNumber.trim() || "1",
            framing: framing.trim() || "Medium (MS)",
            cameraLens: cameraLens.trim() || "50mm f/1.2",
            lightingSetup: lightingSetup.trim() || "Ambient",
            description: description.trim(),
            status,
          });

          if (!res.success || !res.shot) {
            toast.error(res.message || "Failed to update shot.");
            return;
          }

          toast.success(`Shot ${res.shot.sceneNumber}-${res.shot.shotNumber} updated.`);
          onSaved(res.shot as unknown as ShotItemData, true);
          onClose();
        } else {
          const res = await createShotItem({
            projectId,
            tenantSlug,
            sceneNumber: sceneNumber.trim() || "1",
            shotNumber: shotNumber.trim() || "1",
            framing: framing.trim() || "Medium (MS)",
            cameraLens: cameraLens.trim() || "50mm f/1.2",
            lightingSetup: lightingSetup.trim() || "Ambient",
            description: description.trim(),
            status,
          });

          if (!res.success || !res.shot) {
            toast.error(res.message || "Failed to create shot.");
            return;
          }

          toast.success(`Shot ${res.shot.sceneNumber}-${res.shot.shotNumber} added to shot list.`);
          onSaved(res.shot as unknown as ShotItemData, false);
          onClose();
        }
      } catch (err: any) {
        console.error("Save shot error:", err);
        toast.error(err.message || "An unexpected error occurred.");
      }
    });
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        {...dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shot-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl my-8 rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 sm:p-6 shadow-2xl text-zinc-100 space-y-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Film className="size-4" />
            </div>
            <div>
              <h3 id="shot-dialog-title" className="text-base font-bold text-white tracking-tight">
                {isEdit ? "Edit Shot Item" : "Plan New Shot"}
              </h3>
              <p className="text-xs text-zinc-400">
                {isEdit
                  ? "Update scene framing, optics, lighting setup and action"
                  : "Add a planned take to the visual call list"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Scene and Shot Number */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="sceneNumber" className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                Scene #
              </label>
              <input
                id="sceneNumber"
                type="text"
                required
                value={sceneNumber}
                onChange={(e) => setSceneNumber(e.target.value)}
                placeholder="e.g. 1 or Ext. Garden"
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="shotNumber" className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                Shot #
              </label>
              <input
                id="shotNumber"
                type="text"
                required
                value={shotNumber}
                onChange={(e) => setShotNumber(e.target.value)}
                placeholder="e.g. 1A, Hero 1"
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          {/* Framing Presets & Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="framing" className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Video className="size-3.5 text-amber-400" />
                <span>Framing / Composition</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FRAMING_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFraming(p)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    framing === p
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-medium"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              id="framing"
              type="text"
              required
              value={framing}
              onChange={(e) => setFraming(e.target.value)}
              placeholder="Or enter custom framing..."
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Lens Presets & Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="cameraLens" className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="size-3.5 text-indigo-400" />
                <span>Camera / Lens Optics</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LENS_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCameraLens(p)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    cameraLens === p
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-medium"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              id="cameraLens"
              type="text"
              required
              value={cameraLens}
              onChange={(e) => setCameraLens(e.target.value)}
              placeholder="Or enter custom lens..."
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Lighting Presets & Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="lightingSetup" className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sun className="size-3.5 text-amber-300" />
                <span>Lighting Setup</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LIGHTING_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setLightingSetup(p)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    lightingSetup === p
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-medium"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              id="lightingSetup"
              type="text"
              required
              value={lightingSetup}
              onChange={(e) => setLightingSetup(e.target.value)}
              placeholder="Or enter lighting scheme..."
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Description & Action */}
          <div className="space-y-1.5">
            <label htmlFor="description" className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
              Subject Action / Notes
            </label>
            <textarea
              id="description"
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Bride walks down aisle, smiling towards groom. Pull focus from father's hand to bride's reaction."
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Status Selection (only if editing or planning) */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
              Initial Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStatus("PENDING")}
                className={`py-2 px-3 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                  status === "PENDING"
                    ? "bg-zinc-800 text-white border-zinc-600"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"
                }`}
              >
                Queued
              </button>
              <button
                type="button"
                onClick={() => setStatus("IN_PROGRESS")}
                className={`py-2 px-3 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                  status === "IN_PROGRESS"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"
                }`}
              >
                Rolling
              </button>
              <button
                type="button"
                onClick={() => setStatus("COMPLETED")}
                className={`py-2 px-3 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                  status === "COMPLETED"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"
                }`}
              >
                Completed
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2.5 rounded-xl border border-zinc-800 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2.5 rounded-xl bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 active:scale-95 transition-all flex items-center gap-1.5 shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              <span>{isEdit ? "Save Changes" : "Add to Shot List"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

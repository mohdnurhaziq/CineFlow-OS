"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Video,
  Layers,
  Filter,
  Check,
  Sparkles,
} from "lucide-react";
import { toggleShotCompletion } from "@/lib/actions/logistics";

export interface ShotItemData {
  id: string;
  projectId: string;
  sceneNumber: number;
  shotNumber: string;
  framing: string;
  cameraLens: string;
  lightingSetup: string;
  referenceImageUrl?: string | null;
  description: string;
  status: string; // PENDING, IN_PROGRESS, COMPLETED
  sortOrder: number;
}

interface ShotListHudProps {
  initialShots: ShotItemData[];
  tenantSlug?: string;
}

export function ShotListHud({ initialShots, tenantSlug }: ShotListHudProps) {
  const [shots, setShots] = useState<ShotItemData[]>(initialShots);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sceneFilter, setSceneFilter] = useState<number | "ALL">("ALL");
  const [isPending, startTransition] = useTransition();
  const [activeUpdatingId, setActiveUpdatingId] = useState<string | null>(null);

  // Compute metrics
  const total = shots.length;
  const completed = shots.filter((s) => s.status === "COMPLETED").length;
  const inProgress = shots.filter((s) => s.status === "IN_PROGRESS").length;
  const pending = shots.filter((s) => s.status === "PENDING").length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Extract unique scenes
  const scenes = Array.from(new Set(shots.map((s) => s.sceneNumber))).sort((a, b) => a - b);

  // Filtered shot items
  const filteredShots = shots.filter((shot) => {
    if (statusFilter !== "ALL" && shot.status !== statusFilter) return false;
    if (sceneFilter !== "ALL" && shot.sceneNumber !== sceneFilter) return false;
    return true;
  });

  const handleStatusChange = (
    shotId: string,
    newStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED"
  ) => {
    setActiveUpdatingId(shotId);

    // Optimistic UI update
    setShots((prev) =>
      prev.map((s) => (s.id === shotId ? { ...s, status: newStatus } : s))
    );

    startTransition(async () => {
      try {
        const res = await toggleShotCompletion({
          shotId,
          status: newStatus,
          tenantSlug,
        });
        if (!res.success) {
          // Revert if error
          setShots(initialShots);
        }
      } catch (err) {
        console.error("Failed to toggle shot status:", err);
        setShots(initialShots);
      } finally {
        setActiveUpdatingId(null);
      }
    });
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-4 sm:p-5 shadow-xl space-y-5">
      {/* HUD Header & Metric Progress */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Video className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                <span>Visual Shot List HUD</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono">
                  {completed}/{total} Completed
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Glove-friendly on-set check-off mode (48px+ touch targets)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-lg font-bold font-mono text-emerald-400 leading-none">
                {percentage}%
              </div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mt-0.5">
                Target Progress
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="w-full h-2 rounded-full bg-zinc-800/80 overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-emerald-500 to-emerald-400 transition-all duration-300 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-zinc-800/80">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              statusFilter === "ALL"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            All ({total})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("PENDING")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              statusFilter === "PENDING"
                ? "bg-zinc-800 text-amber-300 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Pending ({pending})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("IN_PROGRESS")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              statusFilter === "IN_PROGRESS"
                ? "bg-zinc-800 text-indigo-300 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            In Progress ({inProgress})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("COMPLETED")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              statusFilter === "COMPLETED"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Completed ({completed})
          </button>
        </div>

        {/* Scene Filter Selector */}
        {scenes.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Filter className="size-3.5 text-zinc-500" />
            <span>Scene:</span>
            <select
              value={sceneFilter}
              onChange={(e) =>
                setSceneFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value))
              }
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">All Scenes ({scenes.length})</option>
              {scenes.map((sc) => (
                <option key={sc} value={sc}>
                  Scene {sc}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Shot Cards Grid */}
      <div className="space-y-3">
        {filteredShots.length === 0 ? (
          <div className="text-center py-10 rounded-xl border border-dashed border-zinc-800 text-zinc-500 text-xs font-mono">
            No shots matching current filter.
          </div>
        ) : (
          filteredShots.map((shot) => {
            const isCompleted = shot.status === "COMPLETED";
            const isInProgress = shot.status === "IN_PROGRESS";
            const isPendingShot = shot.status === "PENDING";
            const isThisUpdating = activeUpdatingId === shot.id && isPending;

            return (
              <div
                key={shot.id}
                className={`rounded-xl border transition-all duration-200 p-3 sm:p-4 ${
                  isCompleted
                    ? "bg-zinc-900/40 border-emerald-500/30 shadow-emerald-500/5 shadow-md"
                    : isInProgress
                    ? "bg-zinc-900/70 border-amber-500/40 shadow-amber-500/5 shadow-md"
                    : "bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Left: Shot Metadata & Description */}
                  <div className="flex-1 space-y-2.5">
                    {/* Header Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-zinc-800 text-white border border-zinc-700">
                        SCENE {shot.sceneNumber} • SHOT {shot.shotNumber}
                      </span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {shot.framing}
                      </span>
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="size-3" />
                          <span>COMPLETED</span>
                        </span>
                      )}
                      {isInProgress && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 animate-pulse">
                          <Loader2 className="size-3 animate-spin" />
                          <span>ROLLING / IN PROGRESS</span>
                        </span>
                      )}
                      {isPendingShot && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-400">
                          <Clock className="size-3" />
                          <span>QUEUED</span>
                        </span>
                      )}
                    </div>

                    {/* Creative Description */}
                    <p className="text-sm text-zinc-200 leading-relaxed font-normal">
                      {shot.description}
                    </p>

                    {/* Technical Lens & Lighting Specs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <span className="font-mono text-[11px] text-zinc-500 uppercase">
                          Lens:
                        </span>
                        <span className="text-zinc-300 font-mono text-[11px]">
                          {shot.cameraLens}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <span className="font-mono text-[11px] text-zinc-500 uppercase">
                          Lighting:
                        </span>
                        <span className="text-zinc-300 text-[11px] truncate">
                          {shot.lightingSetup}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Large 48px Touch Check-off Target Controls */}
                  <div className="shrink-0 flex sm:flex-row md:flex-col items-center gap-2 self-stretch md:self-center justify-end">
                    <div className="grid grid-cols-3 md:flex md:flex-col gap-2 w-full sm:w-auto">
                      {/* Button 1: Queued / Pending */}
                      <button
                        type="button"
                        disabled={isThisUpdating}
                        onClick={() => handleStatusChange(shot.id, "PENDING")}
                        title="Mark Queued (Pending)"
                        className={`min-h-[48px] min-w-[48px] px-3.5 py-2.5 rounded-xl text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 ${
                          isPendingShot
                            ? "bg-zinc-800 text-white border-2 border-zinc-600 shadow-inner"
                            : "bg-zinc-900 hover:bg-zinc-800/90 text-zinc-500 hover:text-zinc-300 border border-zinc-800"
                        }`}
                      >
                        <Clock className="size-4 shrink-0" />
                        <span className="sm:inline">Queued</span>
                      </button>

                      {/* Button 2: In Progress */}
                      <button
                        type="button"
                        disabled={isThisUpdating}
                        onClick={() => handleStatusChange(shot.id, "IN_PROGRESS")}
                        title="Mark In Progress"
                        className={`min-h-[48px] min-w-[48px] px-3.5 py-2.5 rounded-xl text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 ${
                          isInProgress
                            ? "bg-amber-500/20 text-amber-300 border-2 border-amber-500 shadow-amber-500/20 shadow-md font-bold"
                            : "bg-zinc-900 hover:bg-zinc-800/90 text-zinc-500 hover:text-amber-400 border border-zinc-800"
                        }`}
                      >
                        <Loader2
                          className={`size-4 shrink-0 ${isInProgress ? "animate-spin" : ""}`}
                        />
                        <span className="sm:inline">Rolling</span>
                      </button>

                      {/* Button 3: Completed */}
                      <button
                        type="button"
                        disabled={isThisUpdating}
                        onClick={() => handleStatusChange(shot.id, "COMPLETED")}
                        title="Mark Completed"
                        className={`min-h-[48px] min-w-[48px] px-3.5 py-2.5 rounded-xl text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 ${
                          isCompleted
                            ? "bg-emerald-500 text-black border-2 border-emerald-400 shadow-emerald-500/30 shadow-lg font-bold"
                            : "bg-zinc-900 hover:bg-emerald-950/30 text-zinc-400 hover:text-emerald-400 border border-zinc-800"
                        }`}
                      >
                        <Check className="size-4 shrink-0 stroke-[3]" />
                        <span className="sm:inline">Done</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

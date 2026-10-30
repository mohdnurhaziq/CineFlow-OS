"use client";

import { useState } from "react";
import {
  X,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Wrench,
  Camera,
  AlertCircle,
} from "lucide-react";
import { logPreShootInspection, logPostShootInspection } from "@/lib/actions/gear";

export interface ReservationWithDetails {
  id: string;
  projectId: string;
  itemId: string;
  startDate: Date | string;
  endDate: Date | string;
  status: string; // RESERVED, CHECKED_OUT, RETURNED
  project: {
    id: string;
    title: string;
    projectNumber: string;
  };
  item: {
    id: string;
    name: string;
    sku: string;
    condition: string;
    status: string;
  };
  inspection?: {
    id: string;
    inspectorName: string;
    checkoutCondition: string;
    checkinCondition?: string | null;
    notes?: string | null;
  } | null;
}

interface InspectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  reservation: ReservationWithDetails | null;
  mode: "PRE_SHOOT" | "POST_SHOOT";
  onSuccess?: () => void;
}

const CONDITIONS = [
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "MAINTENANCE_NEEDED",
  "DAMAGED",
];

export function InspectionDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  reservation,
  mode,
  onSuccess,
}: InspectionDialogProps) {
  const [inspectorName, setInspectorName] = useState("Liam Ross (Key Tech)");
  const [condition, setCondition] = useState<string>(
    reservation?.item.condition || "EXCELLENT"
  );
  const [notes, setNotes] = useState("");
  // Pre-shoot checks
  const [sensorVerified, setSensorVerified] = useState(true);
  const [mediaFormatted, setMediaFormatted] = useState(true);
  const [batteriesCharged, setBatteriesCharged] = useState(true);
  // Post-shoot checks
  const [damageFlag, setDamageFlag] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !reservation) return null;

  const isPreShoot = mode === "PRE_SHOOT";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (isPreShoot) {
        const res = await logPreShootInspection({
          tenantId,
          tenantSlug,
          reservationId: reservation.id,
          inspectorName,
          condition: condition as any,
          notes: notes || undefined,
          sensorVerified,
          mediaFormatted,
          batteriesCharged,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to log pre-shoot inspection.");
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await logPostShootInspection({
          tenantId,
          tenantSlug,
          reservationId: reservation.id,
          inspectorName,
          condition: condition as any,
          damageFlag,
          notes: notes || undefined,
        });

        if (!res.success) {
          setErrorMessage(res.message || "Failed to log post-shoot inspection.");
          setIsSubmitting(false);
          return;
        }
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-0">
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#0d0d10] p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold">
                {isPreShoot ? "PRE-SHOOT DISPATCH" : "POST-SHOOT CHECK-IN"}
              </span>
              <span className="text-xs text-zinc-400 font-mono">
                {reservation.project.projectNumber}
              </span>
            </div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <ClipboardCheck className="size-4 text-amber-400" />
              <span>
                {isPreShoot
                  ? "Pre-Shoot Check-Out Condition Log"
                  : "Post-Shoot Return Inspection Log"}
              </span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {reservation.item.name} ({reservation.item.sku})
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Inspector Credentials */}
          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Inspector Credentials / Staff Name *
            </label>
            <input
              type="text"
              required
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              placeholder="e.g. Liam Ross (Lead Grip / Tech)"
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Condition Selector */}
          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Observed Physical Condition *
            </label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              {CONDITIONS.map((cond) => (
                <option key={cond} value={cond}>
                  {cond}
                </option>
              ))}
            </select>
          </div>

          {/* Pre-Shoot Verification Checklist */}
          {isPreShoot ? (
            <div className="space-y-2 p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold mb-1">
                Pre-Dispatch Quality Checklist
              </div>

              <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sensorVerified}
                  onChange={(e) => setSensorVerified(e.target.checked)}
                  className="size-4 accent-amber-500 rounded"
                />
                <span>Optical sensor inspected under 10x LED loupe (dust/scratch free)</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mediaFormatted}
                  onChange={(e) => setMediaFormatted(e.target.checked)}
                  className="size-4 accent-amber-500 rounded"
                />
                <span>Media cards verified & exFAT formatted in camera body</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={batteriesCharged}
                  onChange={(e) => setBatteriesCharged(e.target.checked)}
                  className="size-4 accent-amber-500 rounded"
                />
                <span>Batteries at 100% state-of-charge with calibrated charger</span>
              </label>
            </div>
          ) : (
            /* Post-Shoot Damage Flagging */
            <div className="space-y-3 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-white font-semibold">
                    Damage / Fault Flagging
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Flag scratches, sensor dust, water contact, or dropped hardware
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={damageFlag}
                    onChange={(e) => setDamageFlag(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                </label>
              </div>

              {damageFlag && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    Item will automatically transition to <strong>MAINTENANCE</strong> status and be locked from immediate dispatch.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Inspection Notes */}
          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Inspection Notes / Bench Observations
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isPreShoot
                  ? "e.g. Pelican 1510 #2; include 3x Anton Bauer 150Wh packs."
                  : "e.g. Returned clean, minor scuff on bottom 15mm rod mount clamp."
              }
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white text-xs font-mono transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                isPreShoot
                  ? "bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20"
                  : damageFlag
                  ? "bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/20"
                  : "bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20"
              }`}
            >
              {isSubmitting
                ? "Recording..."
                : isPreShoot
                ? "Dispatch Equipment (ON_SHOOT)"
                : "Complete Check-In & Finalize"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

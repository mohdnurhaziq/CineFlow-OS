"use client";

import { useState, useMemo } from "react";
import { X, Calendar, Layers, AlertCircle, Loader2, Sparkles, Check } from "lucide-react";
import { batchGenerateBookingSlots } from "@/lib/actions/admin-calendar";
import { parseTimeToMinutes } from "@/lib/utils/time";
import type { CategoryOption } from "./single-slot-dialog";

interface BatchGeneratorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  currency: string;
  categories: CategoryOption[];
  onSuccess?: () => void;
}

const DAYS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

export function BatchGeneratorDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  currency,
  categories,
  onSuccess,
}: BatchGeneratorDialogProps) {
  // Dates default: tomorrow to 7 days ahead
  const defaultStart: string = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0] || "";
  }, []);

  const defaultEnd: string = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0] || "";
  }, []);

  const [startDate, setStartDate] = useState<string>(defaultStart);
  const [endDate, setEndDate] = useState<string>(defaultEnd);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5, 6]); // Mon-Sat
  const [dayStartTime, setDayStartTime] = useState("09:00 AM");
  const [dayEndTime, setDayEndTime] = useState("06:00 PM");
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(60);
  const [bufferMinutes, setBufferMinutes] = useState(15);
  const [category, setCategory] = useState(categories[0]?.slug || "STUDIO_PORTRAIT");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [price, setPrice] = useState("0");
  const [depositRequired, setDepositRequired] = useState("50");
  const [skipConflicts, setSkipConflicts] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // Live Slot Count Estimator
  const estimatedCount = useMemo(() => {
    try {
      const start = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${endDate}T00:00:00.000Z`);
      if (start > end) return 0;

      const startMin = parseTimeToMinutes(dayStartTime);
      const endMin = parseTimeToMinutes(dayEndTime);
      if (startMin >= endMin || slotDurationMinutes <= 0) return 0;

      let slotsPerDay = 0;
      let cur = startMin;
      while (cur + slotDurationMinutes <= endMin) {
        slotsPerDay++;
        cur += slotDurationMinutes + bufferMinutes;
      }

      let qualifyingDays = 0;
      const current = new Date(start);
      while (current <= end) {
        if (daysOfWeek.includes(current.getUTCDay())) {
          qualifyingDays++;
        }
        current.setUTCDate(current.getUTCDate() + 1);
      }

      return slotsPerDay * qualifyingDays;
    } catch {
      return 0;
    }
  }, [startDate, endDate, daysOfWeek, dayStartTime, dayEndTime, slotDurationMinutes, bufferMinutes]);

  if (!isOpen) return null;

  const toggleDay = (day: number) => {
    if (daysOfWeek.includes(day)) {
      if (daysOfWeek.length === 1) return; // Keep at least one
      setDaysOfWeek(daysOfWeek.filter((d) => d !== day));
    } else {
      setDaysOfWeek([...daysOfWeek, day].sort());
    }
  };

  const setPreset = (type: "ALL" | "WEEKDAYS" | "WEEKENDS") => {
    if (type === "ALL") setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
    else if (type === "WEEKDAYS") setDaysOfWeek([1, 2, 3, 4, 5]);
    else if (type === "WEEKENDS") setDaysOfWeek([0, 6]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setResultMessage(null);

    const parsedPrice = parseFloat(price);
    const parsedDeposit = parseFloat(depositRequired);

    try {
      const res = await batchGenerateBookingSlots({
        tenantId,
        tenantSlug,
        startDate,
        endDate,
        daysOfWeek,
        dayStartTime,
        dayEndTime,
        slotDurationMinutes,
        bufferMinutes,
        category,
        campaignTitle: campaignTitle || null,
        price: isNaN(parsedPrice) ? 0 : parsedPrice,
        depositRequired: isNaN(parsedDeposit) ? 50 : parsedDeposit,
        skipConflicts,
      });

      if (!res.success) {
        setErrorMessage(res.message || "Failed to batch generate slots.");
        setIsSubmitting(false);
        return;
      }

      setResultMessage(res.message || `Generated ${res.createdCount} slots.`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-0">
      <div className="relative w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#0d0d10] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="size-4 text-amber-400" />
              <span>Algorithmic Batch Slot Generator</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Rapidly generate recurring shooting blocks across customized date ranges
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {resultMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <Check className="size-4 shrink-0" />
              <span>{resultMessage}</span>
            </div>
          )}

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                End Date *
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* Days of Week */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-zinc-400">
                Operating Days *
              </label>
              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                <button
                  type="button"
                  onClick={() => setPreset("ALL")}
                  className="hover:text-amber-400 underline"
                >
                  All
                </button>
                <span>|</span>
                <button
                  type="button"
                  onClick={() => setPreset("WEEKDAYS")}
                  className="hover:text-amber-400 underline"
                >
                  Weekdays
                </button>
                <span>|</span>
                <button
                  type="button"
                  onClick={() => setPreset("WEEKENDS")}
                  className="hover:text-amber-400 underline"
                >
                  Weekends
                </button>
              </div>
            </div>

            <div className="flex gap-1.5">
              {DAYS.map((d) => {
                const isSelected = daysOfWeek.includes(d.value);
                return (
                  <button
                    type="button"
                    key={d.value}
                    onClick={() => toggleDay(d.value)}
                    className={`flex-1 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                      isSelected
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold"
                        : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Daily Time Window */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Day Start Time *
              </label>
              <input
                type="text"
                required
                value={dayStartTime}
                onChange={(e) => setDayStartTime(e.target.value)}
                placeholder="09:00 AM"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Day End Time *
              </label>
              <input
                type="text"
                required
                value={dayEndTime}
                onChange={(e) => setDayEndTime(e.target.value)}
                placeholder="06:00 PM"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* Durations & Buffers */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Slot Duration (Minutes) *
              </label>
              <select
                value={slotDurationMinutes}
                onChange={(e) => setSlotDurationMinutes(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition-colors"
              >
                <option value={30}>30 mins</option>
                <option value={45}>45 mins</option>
                <option value={60}>60 mins (1 hr)</option>
                <option value={90}>90 mins (1.5 hrs)</option>
                <option value={120}>120 mins (2 hrs)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Buffer / Reset Time (Minutes)
              </label>
              <select
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition-colors"
              >
                <option value={0}>0 mins (Back-to-back)</option>
                <option value={15}>15 mins</option>
                <option value={30}>30 mins</option>
              </select>
            </div>
          </div>

          {/* Category & Campaign */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Campaign Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.badgeIcon ? `${c.badgeIcon} ` : ""}{c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Campaign Title
              </label>
              <input
                type="text"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                placeholder="e.g. Peak Weekend Sessions"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Session Fee ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-zinc-400 block mb-1">
                Deposit Required ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={depositRequired}
                onChange={(e) => setDepositRequired(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* Conflict Skipping Checkbox */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div>
              <span className="text-xs font-medium text-white block">Skip Conflicting Slots</span>
              <span className="text-[11px] text-zinc-400">Ignore times where a slot already exists in inventory</span>
            </div>
            <input
              type="checkbox"
              checked={skipConflicts}
              onChange={(e) => setSkipConflicts(e.target.checked)}
              className="rounded border-zinc-600 text-amber-500 focus:ring-0 size-4"
            />
          </div>

          {/* Live Estimate Badge */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
            <span className="text-xs font-mono text-amber-300">
              Estimated Total Slots to Generate:
            </span>
            <span className="text-base font-bold font-mono text-amber-400">
              ~{estimatedCount} slots
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || estimatedCount === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <span>Generate {estimatedCount} Slots</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { Clock, Loader2 } from "lucide-react";
import { minutesOfDay, sessionBlock } from "@/lib/slot-time";

export interface BookingSlotItem {
  id: string;
  tenantId: string;
  category: string;
  campaignTitle?: string | null;
  date: Date | string;
  startTime: string;
  endTime: string;
  status: string; // AVAILABLE, HELD, PENDING_VERIFICATION, BOOKED, BLOCKED
  heldUntil?: Date | string | null;
  heldBySessionId?: string | null;
  price: number;
  depositRequired: number;
}

interface CinemaSlotGridProps {
  slots: BookingSlotItem[];
  sessionId: string;
  currentHeldSlotId: string | null;
  onSlotClick: (slot: BookingSlotItem) => void;
  currency: string;
  brandColor?: string | null;
  /** Display name for a slot's category slug. */
  categoryLabel?: (slug: string) => string;
  /** Deposit shown on the card; matches what the booking will actually charge. */
  depositLabel?: (slot: BookingSlotItem) => string;
  /** Slot whose hold request is in flight. */
  pendingSlotId?: string | null;
}

export function CinemaSlotGrid({
  slots,
  sessionId,
  currentHeldSlotId,
  onSlotClick,
  currency,
  categoryLabel = (slug) => slug,
  depositLabel,
  pendingSlotId = null,
}: CinemaSlotGridProps) {
  const currencySymbol = currency === "MYR" ? "RM " : "$";

  if (slots.length === 0) {
    return (
      <div className="py-16 text-center rounded-2xl border border-zinc-800 bg-[#121215] space-y-3">
        <Clock className="size-8 mx-auto text-zinc-500" />
        <h4 className="text-base font-bold text-white">No Upcoming Slots</h4>
        <p className="text-xs text-zinc-400 max-w-sm mx-auto">
          The studio has no upcoming sessions open for this category. Please select another category or contact the studio on WhatsApp.
        </p>
      </div>
    );
  }

  // Group by real clock time and order within each block by start time, not by text.
  const byStart = (a: BookingSlotItem, b: BookingSlotItem) =>
    (minutesOfDay(a.startTime) ?? 0) - (minutesOfDay(b.startTime) ?? 0);
  const ordered = [...slots].sort(byStart);
  const morningSlots = ordered.filter((s) => sessionBlock(s.startTime) === "morning");
  const afternoonSlots = ordered.filter((s) => sessionBlock(s.startTime) === "afternoon");
  const eveningSlots = ordered.filter((s) => sessionBlock(s.startTime) === "evening");

  const renderSlotBlock = (title: string, subtitle: string, blockSlots: BookingSlotItem[]) => {
    if (blockSlots.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-amber-400" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              {title}
            </span>
          </div>
          <span className="text-[11px] font-mono text-zinc-400">{subtitle}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {blockSlots.map((slot) => {
            const isHeldByMe =
              slot.id === currentHeldSlotId ||
              (slot.status === "HELD" && slot.heldBySessionId === sessionId);

            const isHeldByOther =
              slot.status === "HELD" && slot.heldBySessionId !== sessionId;

            const isBooked =
              slot.status === "BOOKED" || slot.status === "PENDING_VERIFICATION";

            const isBlocked = slot.status === "BLOCKED";
            const isAvailable = slot.status === "AVAILABLE" && !isHeldByOther;
            const isPending = slot.id === pendingSlotId;

            return (
              <button
                key={slot.id}
                type="button"
                disabled={isHeldByOther || isBooked || isBlocked || pendingSlotId !== null}
                aria-busy={isPending || undefined}
                onClick={() => onSlotClick(slot)}
                className={`relative p-3.5 rounded-xl border text-left transition-all duration-150 flex flex-col justify-between select-none ${
                  isPending
                    ? "bg-amber-500/5 border-amber-500/60 cursor-wait"
                    : isHeldByMe
                    ? "bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/50 shadow-lg shadow-amber-500/20 active:scale-[0.98]"
                    : isHeldByOther
                    ? "bg-zinc-900/60 border-zinc-800 opacity-60 cursor-not-allowed"
                    : isBooked
                    ? "bg-[#0c0c0f] border-zinc-900 opacity-40 cursor-not-allowed line-through"
                    : isBlocked
                    ? "bg-zinc-950 border-dashed border-zinc-800 opacity-35 cursor-not-allowed"
                    : "bg-[#121215] border-zinc-800 hover:border-zinc-700 hover:bg-[#151518] active:scale-[0.98] cursor-pointer"
                }`}
              >
                {/* Diagonal stripes overlay for held by other */}
                {isHeldByOther && (
                  <div className="absolute inset-0 rounded-xl bg-[linear-gradient(45deg,transparent_25%,rgba(245,158,11,0.06)_50%,transparent_75%)] bg-[length:10px_10px] pointer-events-none" />
                )}

                {/* Top Badge */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold tracking-tight text-zinc-400">
                    {categoryLabel(slot.category)}
                  </span>

                  {isPending && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-zinc-800 text-amber-400">
                      <Loader2 className="size-2.5 animate-spin" aria-hidden="true" />
                      HOLDING
                    </span>
                  )}

                  {isHeldByMe && !isPending && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500 text-black animate-pulse">
                      YOUR HOLD
                    </span>
                  )}
                  {isHeldByOther && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-amber-400">
                      HELD
                    </span>
                  )}
                  {isBooked && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400">
                      BOOKED
                    </span>
                  )}
                  {isBlocked && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400">
                      BLOCKED
                    </span>
                  )}
                  {isAvailable && !isHeldByMe && !isPending && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                      AVAILABLE
                    </span>
                  )}
                </div>

                {/* Time Display */}
                <div className="space-y-0.5">
                  <div className="font-mono text-sm font-bold text-white tracking-tight">
                    {slot.startTime}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-400">to {slot.endTime}</div>
                </div>

                {/* Deposit / Price */}
                <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-baseline justify-between text-xs font-mono">
                  <span className="text-[10px] text-zinc-400">Deposit:</span>
                  <span
                    className={`font-bold tabular-nums ${
                      isHeldByMe ? "text-amber-400" : isAvailable ? "text-zinc-200" : "text-zinc-400"
                    }`}
                  >
                    {depositLabel ? depositLabel(slot) : `${currencySymbol}${slot.depositRequired.toLocaleString("en-US")}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {renderSlotBlock("Morning Call Session", "Before 12:00 PM", morningSlots)}
      {renderSlotBlock("Afternoon Production Session", "12:00 PM – 5:00 PM", afternoonSlots)}
      {renderSlotBlock("Golden Hour & Evening Sessions", "From 5:00 PM", eveningSlots)}
    </div>
  );
}

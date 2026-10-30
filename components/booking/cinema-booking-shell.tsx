"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, ShieldCheck, Sparkles, X, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CinemaStageIndicator } from "./cinema-stage-indicator";
import { StatusLegendBar } from "./status-legend-bar";
import { CinemaSlotGrid, type BookingSlotItem } from "./cinema-slot-grid";
import { SlotCountdownTimer } from "./slot-countdown-timer";
import { BookingIntakeModal } from "./booking-intake-modal";
import { holdBookingSlot, releaseBookingSlot } from "@/lib/actions/booking";

interface TenantData {
  id: string;
  name: string;
  slug: string;
  discipline: string;
  currency: string;
  brandColor?: string | null;
  tagline?: string | null;
}

interface CategoryData {
  id: string;
  name: string;
  slug: string;
  badgeIcon?: string | null;
}

interface CinemaBookingShellProps {
  tenant: TenantData;
  categories: CategoryData[];
  initialSlots: BookingSlotItem[];
  initialCategory?: string;
  initialPackageId?: string;
}

export function CinemaBookingShell({
  tenant,
  categories,
  initialSlots,
  initialCategory = "all",
  initialPackageId,
}: CinemaBookingShellProps) {
  const [isPending, startTransition] = useTransition();

  // Local state
  const [slots, setSlots] = useState<BookingSlotItem[]>(initialSlots);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [sessionId, setSessionId] = useState<string>("");
  const [heldSlot, setHeldSlot] = useState<BookingSlotItem | null>(null);
  const [heldUntil, setHeldUntil] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState<boolean>(false);

  // Initialize or read client sessionId
  useEffect(() => {
    let sid = localStorage.getItem("cineflow_session_id");
    if (!sid) {
      sid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem("cineflow_session_id", sid);
    }
    setSessionId(sid);

    // Check if any slot is currently held by this session
    const myHeld = initialSlots.find(
      (s) => s.status === "HELD" && s.heldBySessionId === sid && s.heldUntil && new Date(s.heldUntil) > new Date()
    );

    if (myHeld) {
      setHeldSlot(myHeld);
      setHeldUntil(new Date(myHeld.heldUntil!).toISOString());
    }
  }, [initialSlots]);

  // Handle slot selection (Atomic 10-Minute Hold)
  const handleSlotClick = (slot: BookingSlotItem) => {
    if (!sessionId) return;

    // If clicking already held slot by me, open intake or maintain hold
    if (heldSlot && heldSlot.id === slot.id) {
      setIntakeOpen(true);
      return;
    }

    startTransition(async () => {
      const res = await holdBookingSlot({
        tenantId: tenant.id,
        slotId: slot.id,
        sessionId,
        previousSlotId: heldSlot?.id,
      });

      if (res.success && res.slot && res.heldUntil) {
        toast.success(`Slot locked for 10 minutes! (${slot.startTime})`);
        setHeldSlot(res.slot as any);
        setHeldUntil(res.heldUntil);

        // Update local slots list
        setSlots((prev) =>
          prev.map((s) => {
            if (s.id === slot.id) {
              return {
                ...s,
                status: "HELD",
                heldBySessionId: sessionId,
                heldUntil: res.heldUntil,
              };
            }
            if (heldSlot && s.id === heldSlot.id) {
              return {
                ...s,
                status: "AVAILABLE",
                heldBySessionId: null,
                heldUntil: null,
              };
            }
            return s;
          })
        );
      } else {
        toast.error(res.message || "Failed to hold slot. It may have just been claimed.");
        // If conflict occurred, reload slots state
        if (res.error === "SLOT_ALREADY_HELD" || res.error === "SLOT_ALREADY_BOOKED") {
          setSlots((prev) =>
            prev.map((s) => (s.id === slot.id ? { ...s, status: res.error === "SLOT_ALREADY_BOOKED" ? "BOOKED" : "HELD" } : s))
          );
        }
      }
    });
  };

  // Early voluntary release
  const handleRelease = () => {
    if (!heldSlot || !sessionId) return;

    startTransition(async () => {
      const slotIdToRelease = heldSlot.id;
      const res = await releaseBookingSlot({
        tenantId: tenant.id,
        slotId: slotIdToRelease,
        sessionId,
      });

      if (res.success) {
        toast.info("Slot hold released back to calendar.");
        setHeldSlot(null);
        setHeldUntil(null);
        setSlots((prev) =>
          prev.map((s) => (s.id === slotIdToRelease ? { ...s, status: "AVAILABLE", heldUntil: null, heldBySessionId: null } : s))
        );
      }
    });
  };

  // When 10-minute hold expires
  const handleHoldExpired = () => {
    toast.error("⏱️ Your 10-minute hold has expired. The slot has been returned to the calendar.");
    if (heldSlot) {
      const expiredId = heldSlot.id;
      setHeldSlot(null);
      setHeldUntil(null);
      setIntakeOpen(false);
      setSlots((prev) =>
        prev.map((s) => (s.id === expiredId ? { ...s, status: "AVAILABLE", heldUntil: null, heldBySessionId: null } : s))
      );
    }
  };

  // Filter slots by category
  const filteredSlots = slots.filter((slot) => {
    if (selectedCategory === "all") return true;
    return slot.category.toLowerCase() === selectedCategory.toLowerCase();
  });

  const currencySymbol = tenant.currency === "MYR" ? "RM " : "$";

  return (
    <div className="space-y-10 pb-32">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div className="space-y-1">
          <Link
            href={`/${tenant.slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to {tenant.name} Showcase
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Cinema-Style Soundstage Calendar
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Select an available production slot to lock it exclusively for 10 minutes. Zero double-booking guarantee.
          </p>
        </div>

        {/* Studio Branding Pill */}
        <div className="flex items-center gap-2.5">
          <div
            className="size-8 rounded-lg flex items-center justify-center font-bold text-black text-sm"
            style={{ backgroundColor: tenant.brandColor || "#f59e0b" }}
          >
            {tenant.name.slice(0, 1)}
          </div>
          <div>
            <div className="text-sm font-bold text-white">{tenant.name}</div>
            <div className="text-[10px] font-mono text-zinc-400">
              {tenant.discipline} // {tenant.currency}
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="space-y-2">
        <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          Campaign Category Filter:
        </span>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              selectedCategory === "all"
                ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                : "bg-[#121215] border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
            }`}
          >
            ✨ All Categories
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.slug)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                selectedCategory === c.slug
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                  : "bg-[#121215] border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
              }`}
            >
              <span>{c.badgeIcon || "📁"}</span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Cinema Stage Metaphor */}
      <CinemaStageIndicator brandColor={tenant.brandColor} />

      {/* Status Legend Bar */}
      <StatusLegendBar brandColor={tenant.brandColor} />

      {/* Cinema Seating Slot Grid */}
      <CinemaSlotGrid
        slots={filteredSlots}
        sessionId={sessionId}
        currentHeldSlotId={heldSlot?.id || null}
        onSlotClick={handleSlotClick}
        currency={tenant.currency}
        brandColor={tenant.brandColor}
      />

      {/* Sticky Bottom Action Bar (Visible when slot is held) */}
      {heldSlot && heldUntil && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-4 sm:p-5 border-t border-zinc-800 bg-[#09090b]/95 backdrop-blur-xl shadow-2xl animate-slideUp">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Slot Info */}
            <div className="flex items-center gap-4">
              <div
                className="size-10 rounded-xl flex items-center justify-center font-bold text-black shrink-0"
                style={{ backgroundColor: tenant.brandColor || "#f59e0b" }}
              >
                <Calendar className="size-5" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500 text-black uppercase">
                    Slot Held
                  </span>
                  <span className="text-sm font-bold text-white">
                    {new Date(heldSlot.date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    • {heldSlot.startTime} – {heldSlot.endTime}
                  </span>
                </div>
                <div className="text-xs font-mono text-zinc-400 mt-0.5">
                  Category: <span className="text-zinc-200">{heldSlot.category}</span> • 50% Retainer Required:{" "}
                  <span className="text-amber-400 font-bold tabular-nums">
                    {currencySymbol}
                    {heldSlot.depositRequired}
                  </span>
                </div>
              </div>
            </div>

            {/* Countdown & Action Buttons */}
            <div className="flex items-center gap-3">
              <SlotCountdownTimer
                heldUntil={heldUntil}
                onExpired={handleHoldExpired}
                brandColor={tenant.brandColor}
              />

              <button
                type="button"
                onClick={handleRelease}
                className="px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono font-semibold transition-all active:scale-[0.98]"
              >
                Release Slot
              </button>

              <button
                type="button"
                onClick={() => setIntakeOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-bold text-black shadow-lg shadow-amber-500/25 active:scale-[0.98] transition-all"
                style={{ backgroundColor: tenant.brandColor || "#f59e0b" }}
              >
                <span>Proceed to Booking</span>
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3-Field Booking Intake Modal */}
      <BookingIntakeModal
        isOpen={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        slot={heldSlot}
        sessionId={sessionId}
        brandColor={tenant.brandColor}
        onBookingConfirmed={(code) => {
          setHeldSlot(null);
          setHeldUntil(null);
          setSlots((prev) =>
            prev.map((s) => (heldSlot && s.id === heldSlot.id ? { ...s, status: "BOOKED" } : s))
          );
        }}
      />
    </div>
  );
}

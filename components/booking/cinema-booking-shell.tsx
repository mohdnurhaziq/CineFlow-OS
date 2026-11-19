"use client";

import { buttonVariants } from "@/components/ui/button";
import { useState, useEffect, useMemo, useTransition } from "react";
import { Calendar, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { CinemaStageIndicator } from "./cinema-stage-indicator";
import { StatusLegendBar } from "./status-legend-bar";
import { CinemaSlotGrid, type BookingSlotItem } from "./cinema-slot-grid";
import { SlotHoldWatcher } from "./slot-hold-watcher";
import { BookingIntakeModal } from "./booking-intake-modal";
import { holdBookingSlot, releaseBookingSlot } from "@/lib/actions/booking";
import { formatSlotDate, slotDateKey } from "@/lib/slot-time";
import { formatMoney, packagesFor, type BookingPackageOption } from "./package-picker";

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
  clientAccount?: { name: string; email: string; phone: string } | null;
  packages?: BookingPackageOption[];
}

/** The slot this browser holds (the page doesn't say who holds which). */
const HELD_SLOT_KEY = "cineflow_held_slot";

export function CinemaBookingShell({
  tenant,
  categories,
  initialSlots,
  initialCategory = "all",
  initialPackageId,
  clientAccount = null,
  packages = [],
}: CinemaBookingShellProps) {
  const [, startTransition] = useTransition();

  // Local state
  const [slots, setSlots] = useState<BookingSlotItem[]>(initialSlots);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [sessionId, setSessionId] = useState<string>("");
  const [heldSlot, setHeldSlot] = useState<BookingSlotItem | null>(null);
  const [heldUntil, setHeldUntil] = useState<string | null>(null);
  const [bookedSlotId, setBookedSlotId] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);

  // Initialize or read client sessionId
  useEffect(() => {
    let sid = localStorage.getItem("cineflow_session_id");
    if (!sid) {
      // Long and random: the hold id is what lets this browser keep, release or book its slot.
      sid = `sess_${crypto.randomUUID()}`;
      localStorage.setItem("cineflow_session_id", sid);
    }
    setSessionId(sid);

    // The page never says who holds a slot, so this browser remembers the slot it held.
    const myHeldId = localStorage.getItem(HELD_SLOT_KEY);
    const myHeld = initialSlots.find(
      (s) => s.id === myHeldId && s.status === "HELD" && s.heldUntil && new Date(s.heldUntil) > new Date()
    );

    if (myHeld) {
      setHeldSlot(myHeld);
      setHeldUntil(new Date(myHeld.heldUntil!).toISOString());
      setSlots((prev) => prev.map((s) => (s.id === myHeld.id ? { ...s, heldBySessionId: sid } : s)));
    } else if (myHeldId) {
      localStorage.removeItem(HELD_SLOT_KEY);
    }
  }, [initialSlots]);

  // Handle slot selection (reserves the slot briefly so two clients can't book it at once)
  const handleSlotClick = (slot: BookingSlotItem) => {
    if (!sessionId) return;

    // If clicking already held slot by me, open intake or maintain hold
    if (heldSlot && heldSlot.id === slot.id) {
      setIntakeOpen(true);
      return;
    }

    setPendingSlotId(slot.id);
    startTransition(async () => {
      try {
        await holdSlot(slot);
      } finally {
        setPendingSlotId(null);
      }
    });
  };

  // Reserve a slot for this client while they book (releasing any previous one).
  const holdSlot = async (slot: BookingSlotItem) => {
    const res = await holdBookingSlot({
      tenantId: tenant.id,
      slotId: slot.id,
      sessionId,
      previousSlotId: heldSlot?.id,
    });

    if (res.success && res.slot && res.heldUntil) {
      // No pop-up here: the bar at the bottom of the page already shows the selection.
      setHeldSlot(res.slot);
      setHeldUntil(res.heldUntil);

      localStorage.setItem(HELD_SLOT_KEY, slot.id);
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
      toast.error(res.message || "That time could not be selected. Someone may have just taken it.");
      // If conflict occurred, reload slots state
      if (res.error === "SLOT_ALREADY_HELD" || res.error === "SLOT_ALREADY_BOOKED") {
        setSlots((prev) =>
          prev.map((s) => (s.id === slot.id ? { ...s, status: res.error === "SLOT_ALREADY_BOOKED" ? "BOOKED" : "HELD" } : s))
        );
      }
    }
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
        localStorage.removeItem(HELD_SLOT_KEY);
        setHeldSlot(null);
        setHeldUntil(null);
        setSlots((prev) =>
          prev.map((s) => (s.id === slotIdToRelease ? { ...s, status: "AVAILABLE", heldUntil: null, heldBySessionId: null } : s))
        );
      }
    });
  };

  // When the brief reservation runs out
  const handleHoldExpired = () => {
    toast.error("This time is no longer reserved for you. Please select it again to continue.");
    if (heldSlot) {
      const expiredId = heldSlot.id;
      localStorage.removeItem(HELD_SLOT_KEY);
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

  // One day at a time: the same time on different days must never look like the same session.
  const days = useMemo(() => {
    const map = new Map<string, { key: string; total: number; open: number }>();
    for (const slot of filteredSlots) {
      const key = slotDateKey(slot.date);
      const day = map.get(key) ?? { key, total: 0, open: 0 };
      day.total += 1;
      if (slot.status === "AVAILABLE" || (slot.status === "HELD" && slot.heldBySessionId === sessionId)) day.open += 1;
      map.set(key, day);
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [filteredSlots, sessionId]);

  // Keep the chosen day if it still exists under the current category, else the first day with open slots.
  const activeDate =
    (selectedDate && days.some((d) => d.key === selectedDate) ? selectedDate : null) ??
    days.find((d) => d.open > 0)?.key ??
    days[0]?.key ??
    null;
  const daySlots = activeDate ? filteredSlots.filter((slot) => slotDateKey(slot.date) === activeDate) : [];

  // The deposit a slot will actually charge: the cheapest package for its category, or the slot's own deposit.
  const depositFor = (slot: BookingSlotItem) => {
    const offered = packagesFor(packages, slot.category);
    if (offered.length === 0) return { amount: slot.depositRequired, from: false };
    return { amount: Math.min(...offered.map((p) => p.depositPrice)), from: offered.length > 1 };
  };
  const depositLabel = (slot: BookingSlotItem) => {
    const { amount, from } = depositFor(slot);
    const money = formatMoney(tenant.currency, amount).replace(/\.00$/, "");
    return from ? `from ${money}` : money;
  };
  const categoryLabel = (slug: string) =>
    categories.find((c) => c.slug.toLowerCase() === slug.toLowerCase())?.name ?? slug;

  return (
    <div className={`space-y-10 ${heldSlot ? "pb-64 sm:pb-40" : "pb-16"}`}>
      {/* Top Header Bar */}
      {/* The page's top bar (client portal or studio website) carries the studio name and the account menu. */}
      <div className="border-b border-zinc-800 pb-6">
        <div className="space-y-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Book a session
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Pick an available time to start your booking.
          </p>
        </div>

      </div>

      {/* Category Filter Pills */}
      <div className="space-y-2">
        <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          Category
        </span>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
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
              className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
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

      {/* Date Strip */}
      {days.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">Choose a date:</span>
          <div className="flex items-stretch gap-2 overflow-x-auto pb-2 scrollbar-none">
            {days.map((day) => {
              const active = day.key === activeDate;
              const full = day.open === 0;
              return (
                <button
                  key={day.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedDate(day.key)}
                  className={`shrink-0 min-w-[84px] px-3 py-2.5 rounded-xl border text-center transition-all active:scale-[0.98] ${
                    active
                      ? "bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/20"
                      : "bg-[#121215] border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white"
                  }`}
                >
                  <span className={`block text-[10px] font-mono uppercase tracking-wider ${active ? "text-black/70" : "text-zinc-500"}`}>
                    {formatSlotDate(day.key, { weekday: "short" })}
                  </span>
                  <span className="block text-lg font-black leading-tight tabular-nums">
                    {formatSlotDate(day.key, { day: "numeric" })}
                  </span>
                  <span className={`block text-[10px] font-mono ${active ? "text-black/70" : "text-zinc-500"}`}>
                    {formatSlotDate(day.key, { month: "short" })}
                  </span>
                  <span
                    className={`mt-1 block text-[10px] font-mono font-bold ${
                      active ? "text-black" : full ? "text-zinc-600" : "text-emerald-400"
                    }`}
                  >
                    {full ? "Full" : `${day.open} open`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeDate && (
        <h2 className="text-lg font-bold text-white tracking-tight">
          {formatSlotDate(activeDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </h2>
      )}

      {/* Cinema Seating Slot Grid */}
      <CinemaSlotGrid
        slots={daySlots}
        sessionId={sessionId}
        currentHeldSlotId={heldSlot?.id || null}
        onSlotClick={handleSlotClick}
        currency={tenant.currency}
        brandColor={tenant.brandColor}
        categoryLabel={categoryLabel}
        depositLabel={depositLabel}
        pendingSlotId={pendingSlotId}
      />

      {/* Sticky Bottom Action Bar (Visible when slot is held) */}
      {heldSlot && heldUntil && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-4 sm:p-5 border-t border-zinc-800 bg-[#09090b]/95 backdrop-blur-xl shadow-2xl animate-slideUp">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Slot Info (announced to screen readers, since no pop-up repeats it) */}
            <div role="status" className="flex items-center gap-4">
              <div
                className="size-10 rounded-xl flex items-center justify-center font-bold text-black shrink-0"
                style={{ backgroundColor: tenant.brandColor || "#f59e0b" }}
              >
                <Calendar className="size-5" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500 text-black uppercase">
                    Selected
                  </span>
                  <span className="text-sm font-bold text-white">
                    {formatSlotDate(heldSlot.date, { weekday: "short", day: "numeric", month: "short" })}{" "}
                    • {heldSlot.startTime} – {heldSlot.endTime}
                  </span>
                </div>
                <div className="text-xs font-mono text-zinc-400 mt-0.5">
                  Category: <span className="text-zinc-200">{categoryLabel(heldSlot.category)}</span> • Deposit:{" "}
                  <span className="text-amber-400 font-bold tabular-nums">{depositLabel(heldSlot)}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons (plus a nudge when the reservation is about to run out) */}
            <div className="flex items-center gap-3">
              <SlotHoldWatcher heldUntil={heldUntil} onExpired={handleHoldExpired} />

              <button
                type="button"
                onClick={handleRelease}
                className={buttonVariants({ variant: "secondary" })}
              >
                Clear selection
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
        onClose={() => {
          setIntakeOpen(false);
          // A booked slot stays held here only so the booking form can show its confirmation.
          if (bookedSlotId) {
            setHeldSlot(null);
            setBookedSlotId(null);
          }
        }}
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        slot={heldSlot}
        sessionId={sessionId}
        brandColor={tenant.brandColor}
        clientAccount={clientAccount}
        packages={packages}
        categoryName={heldSlot ? categoryLabel(heldSlot.category) : undefined}
        initialPackageId={initialPackageId}
        onBookingConfirmed={() => {
          // Keep the slot until the form is closed: the form shows the confirmation, with the next
          // step (upload the slip, or pay at the studio). Clearing it here closed the form at once.
          setBookedSlotId(heldSlot?.id ?? null);
          setHeldUntil(null);
          setSlots((prev) =>
            prev.map((s) => (heldSlot && s.id === heldSlot.id ? { ...s, status: "BOOKED" } : s))
          );
        }}
      />
    </div>
  );
}

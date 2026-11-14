"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarPlus, X } from "lucide-react";
import { useDialog } from "@/lib/use-dialog";
import { formatSlotDate, slotDateKey } from "@/lib/slot-time";
import { sameCategory } from "@/lib/bookings/pricing-shared";
import { BookForCustomerDialog, type ClientOption } from "@/components/admin/calendar/book-for-customer-dialog";
import type { BookingSlotRow, CategoryOption } from "@/components/admin/calendar/single-slot-dialog";
import type { BookingPackageOption } from "@/components/booking/package-picker";

interface NewBookingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onBooked: () => void;
  tenantId: string;
  tenantSlug: string;
  currency: string;
  isOwner: boolean;
  /** Open, upcoming slots (see loadBookableSlots), soonest first. */
  slots: BookingSlotRow[];
  categories: CategoryOption[];
  clients: ClientOption[];
  packages: BookingPackageOption[];
}

/**
 * "New booking" on the Bookings page. Step 1 picks an open session; step 2 is the same
 * customer & package form the Calendar uses (BookForCustomerDialog), with a Back button.
 */
export function NewBookingDialog({
  isOpen,
  onClose,
  onBooked,
  tenantId,
  tenantSlug,
  currency,
  isOwner,
  slots,
  categories,
  clients,
  packages,
}: NewBookingDialogProps) {
  const [step, setStep] = useState<"pick" | "details">("pick");
  const [category, setCategory] = useState("all");
  const [slotId, setSlotId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep("pick");
      setCategory("all");
      setSlotId(null);
    }
  }, [isOpen]);

  const categoryOf = (slug: string) => categories.find((c) => sameCategory(c.slug, slug));
  const categoryLabel = (slug: string) => {
    const c = categoryOf(slug);
    return c ? `${c.badgeIcon ? `${c.badgeIcon} ` : ""}${c.name}` : slug;
  };

  // Only categories that currently have open sessions are worth filtering by.
  const categoriesWithSlots = useMemo(() => {
    const seen = new Map<string, number>();
    for (const s of slots) {
      const key = categoryOf(s.category)?.slug ?? s.category;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return [...seen.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, categories]);

  const visible = category === "all" ? slots : slots.filter((s) => sameCategory(s.category, category));
  const byDay = useMemo(() => {
    const groups = new Map<string, BookingSlotRow[]>();
    for (const s of visible) {
      const key = slotDateKey(s.date);
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.entries()];
  }, [visible]);

  const selected = slots.find((s) => s.id === slotId) ?? null;
  const dialog = useDialog(isOpen && step === "pick", onClose);
  if (!isOpen) return null;

  if (step === "details" && selected) {
    return (
      <BookForCustomerDialog
        isOpen
        onClose={onClose}
        onBack={() => setStep("pick")}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        slot={selected}
        clients={clients}
        packages={packages}
        currency={currency}
        isOwner={isOwner}
        onSuccess={onBooked}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-0">
      <div
        {...dialog}
        aria-labelledby="new-booking-dialog-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#0d0d10] shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-[#0d0d10] z-10">
          <div className="flex items-center gap-2">
            <CalendarPlus className="size-5 text-amber-400" aria-hidden="true" />
            <div>
              <h2 id="new-booking-dialog-title" className="text-base font-bold text-white tracking-tight">
                New booking
              </h2>
              <p className="text-[11px] font-mono text-zinc-500">Step 1 of 2 · Pick a session</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {slots.length === 0 ? (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 text-sm text-zinc-300 space-y-2">
              <p>There are no open sessions to book right now.</p>
              <Link
                href={`/${tenantSlug}/admin/calendar`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:underline"
              >
                Open sessions in the Calendar <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-mono text-zinc-400">Category</span>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setSlotId(null);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="all">All categories ({slots.length})</option>
                  {categoriesWithSlots.map(([slug, count]) => (
                    <option key={slug} value={slug}>
                      {categoryLabel(slug)} ({count})
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="space-y-3">
                <legend className="sr-only">Session</legend>
                {byDay.map(([day, daySlots]) => (
                  <div key={day} className="space-y-1.5">
                    <p className="text-xs font-semibold text-zinc-300">
                      {formatSlotDate(day, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {daySlots.map((s) => {
                        const active = s.id === slotId;
                        return (
                          <label
                            key={s.id}
                            className={`cursor-pointer rounded-lg border px-3 py-2 text-xs transition-colors focus-within:ring-2 focus-within:ring-amber-500 ${
                              active
                                ? "border-amber-500 bg-amber-500/15 text-amber-300"
                                : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500"
                            }`}
                          >
                            <input
                              type="radio"
                              name="new-booking-slot"
                              value={s.id}
                              checked={active}
                              onChange={() => setSlotId(s.id)}
                              className="sr-only"
                            />
                            <span className="font-mono">
                              {s.startTime} – {s.endTime}
                            </span>
                            {category === "all" && (
                              <span className="block text-[10px] text-zinc-500 mt-0.5">{categoryLabel(s.category)}</span>
                            )}
                            {s.campaignTitle && (
                              <span className="block text-[10px] text-zinc-500 mt-0.5">{s.campaignTitle}</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </fieldset>
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={() => setStep("details")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-xs tracking-tight transition-all"
            >
              Next
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

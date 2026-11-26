"use client";

import { PageHeader } from "@/components/ui/page";
import { buttonVariants } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Plus,
  Sparkles,
  RefreshCw,
  Search,
  CheckCircle,
  Clock,
  Lock,
  UserCheck,
  CalendarDays,
  List,
} from "lucide-react";
import { cleanupExpiredHolds } from "@/lib/actions/admin-calendar";
import { DatePicker } from "@/components/ui/date-picker";
import { SingleSlotDialog, type BookingSlotRow, type CategoryOption } from "./single-slot-dialog";
import { BatchGeneratorDialog } from "./batch-generator-dialog";
import { ForceReleaseDialog } from "./force-release-dialog";
import { SlotTable } from "./slot-table";
import { BookForCustomerDialog, type ClientOption } from "./book-for-customer-dialog";
import type { AssignableMember } from "@/lib/team/members";
import { BookingDetailsDialog } from "@/components/admin/bookings/booking-details-dialog";
import type { BookingPackageOption } from "@/components/booking/package-picker";
import { getBookingDetails } from "@/lib/actions/admin-bookings";
import type { BookingDetails } from "@/lib/bookings/details";
import type { BookingActionPowers } from "@/lib/auth/page-powers";
import { formatSlotDate, isSlotInPast, slotDateKey, studioNow } from "@/lib/slot-time";
import { compareSlots, daySummaries, defaultCalendarDay } from "@/lib/calendar/month-grid";
import { MonthView } from "./month-view";
import { studioPath } from "@/lib/domain-name";

interface CalendarAdminDashboardProps {
  tenantId: string;
  tenantSlug: string;
  currency: string;
  initialSlots: BookingSlotRow[];
  categories: CategoryOption[];
  clients: ClientOption[];
  packages?: BookingPackageOption[];
  /** Bookings MANAGE: may open, change and book slots. Without it the calendar is read-only. */
  canManage: boolean;
  /** The setPrices permission: may set slot fees. */
  canSetPrices: boolean;
  /** The recordPayments permission: may record a booking as paid. */
  canRecordPayments: boolean;
  /** Mark done / no-show and create the gallery, in a booking's details. */
  actionPowers: BookingActionPowers;
  /** Who can be added to a booking in its details (empty below Bookings MANAGE). */
  assignable: AssignableMember[];
}

export function CalendarAdminDashboard({
  tenantId,
  tenantSlug,
  currency,
  initialSlots,
  categories,
  clients,
  packages = [],
  canManage,
  canSetPrices,
  canRecordPayments,
  actionPowers,
  assignable,
}: CalendarAdminDashboardProps) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  // Slots whose start time has passed are hidden unless asked for (or a date is picked).
  const [showPast, setShowPast] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>("");

  // Month (a grid of days, one day's slots beside it) or List (every slot, for bulk changes).
  const [view, setView] = useState<"month" | "list">("month");
  useEffect(() => {
    try {
      if (window.localStorage.getItem("cineflow.calendar.view") === "list") setView("list");
    } catch {
      // No storage (a private window): Month it is.
    }
  }, []);
  const chooseView = (next: "month" | "list") => {
    setView(next);
    try {
      window.localStorage.setItem("cineflow.calendar.view", next);
    } catch {
      // Remembering the choice is only a convenience.
    }
  };
  const [today] = useState(() => studioNow().dateKey);
  const [selectedDay, setSelectedDay] = useState(() => defaultCalendarDay(initialSlots, today));
  const [shownMonth, setShownMonth] = useState(() => ({
    year: Number(selectedDay.slice(0, 4)),
    month: Number(selectedDay.slice(5, 7)) - 1,
  }));

  // Dialogs
  const [isSingleDialogOpen, setIsSingleDialogOpen] = useState(false);
  const [slotToEdit, setSlotToEdit] = useState<BookingSlotRow | null>(null);

  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);

  const [isForceReleaseOpen, setIsForceReleaseOpen] = useState(false);
  const [slotToRelease, setSlotToRelease] = useState<BookingSlotRow | null>(null);

  const [isBookDialogOpen, setIsBookDialogOpen] = useState(false);
  const [slotToBook, setSlotToBook] = useState<BookingSlotRow | null>(null);

  const [viewBooking, setViewBooking] = useState<{
    open: boolean;
    loading: boolean;
    booking: BookingDetails | null;
    error: string | null;
  }>({ open: false, loading: false, booking: null, error: null });

  const viewRequest = useRef(0);

  const closeBookingDetails = () => {
    viewRequest.current += 1;
    setViewBooking({ open: false, loading: false, booking: null, error: null });
  };

  const handleViewBooking = async (slot: BookingSlotRow) => {
    const bookingId = slot.booking?.id;
    if (!bookingId) return;
    const request = ++viewRequest.current;
    setViewBooking({ open: true, loading: true, booking: null, error: null });
    const res = await getBookingDetails({ tenantId, bookingId });
    // Ignore a late response if the dialog was closed or another booking was opened meanwhile.
    if (request !== viewRequest.current) return;
    setViewBooking(
      res.success
        ? { open: true, loading: false, booking: res.booking, error: null }
        : { open: true, loading: false, booking: null, error: res.error }
    );
  };

  // After a booking action: reload the open booking (it may have moved off this slot) and the calendar.
  const reloadViewedBooking = async () => {
    const bookingId = viewBooking.booking?.id;
    router.refresh();
    if (!bookingId) return;
    const res = await getBookingDetails({ tenantId, bookingId });
    if (res.success) setViewBooking({ open: true, loading: false, booking: res.booking, error: null });
  };

  const [isCleaning, setIsCleaning] = useState(false);

  const handleSuccess = () => {
    router.refresh();
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    try {
      const res = await cleanupExpiredHolds(tenantId, tenantSlug);
      if (res.success && res.releasedCount && res.releasedCount > 0) {
        alert(`Released ${res.releasedCount} expired held slot(s).`);
      }
      handleSuccess();
    } finally {
      setIsCleaning(false);
    }
  };

  // KPI Calculations
  const totalSlots = initialSlots.length;
  const availableSlots = initialSlots.filter((s) => s.status === "AVAILABLE" && !isSlotInPast(s)).length;
  const heldSlots = initialSlots.filter((s) => s.status === "HELD").length;
  const pendingSlots = initialSlots.filter((s) => s.status === "PENDING_VERIFICATION").length;
  const bookedSlots = initialSlots.filter((s) => s.status === "BOOKED").length;
  const blockedSlots = initialSlots.filter((s) => s.status === "BLOCKED").length;

  // Search, status and category apply to both views; the date and past-slot filters to the list.
  const matchesBase = (slot: BookingSlotRow) => {
    const matchesSearch =
      slot.startTime.toLowerCase().includes(searchQuery.toLowerCase()) ||
      slot.endTime.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (slot.campaignTitle && slot.campaignTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (slot.booking && slot.booking.clientName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = selectedStatus === "ALL" || slot.status === selectedStatus;
    const matchesCategory = selectedCategory === "ALL" || slot.category === selectedCategory;
    return matchesSearch && matchesStatus && matchesCategory;
  };
  // In time order: "09:00 AM" before "02:00 PM" (the database sorts the times as text).
  const baseSlots = initialSlots.filter(matchesBase).sort(compareSlots);
  const filteredSlots = baseSlots.filter((slot) => {
    const matchesDate = !dateFilter || slotDateKey(slot.date) === dateFilter;
    const matchesTime = showPast || !!dateFilter || !isSlotInPast(slot);
    return matchesDate && matchesTime;
  });
  const summaries = useMemo(() => daySummaries(baseSlots), [baseSlots]);
  const daySlots = baseSlots.filter((slot) => slotDateKey(slot.date) === selectedDay);
  const selectedSummary = summaries.get(selectedDay);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Calendar}
        title="Calendar"
        description={
          <>
            Open time slots for clients to book, block out days, and see who has booked.{" "}
            <Link href={studioPath(tenantSlug, "/admin/manual/slot-hold")} className="text-amber-400 hover:underline whitespace-nowrap">
              How slot holds work
            </Link>
          </>
        }
        actions={
          canManage && (
          <>
          <button
            type="button"
            onClick={handleCleanup}
            disabled={isCleaning}
            className={buttonVariants({ variant: "secondary" })}
            title="Open up any slots whose hold has already run out"
          >
            <RefreshCw className={`size-3.5 ${isCleaning ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Clean Expired Holds</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBatchDialogOpen(true)}
            className={buttonVariants({ variant: "secondary" })}
          >
            <Sparkles className="size-4" />
            <span>Batch Generate</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSlotToEdit(null);
              setIsSingleDialogOpen(true);
            }}
            className={buttonVariants()}
          >
            <Plus className="size-4" />
            <span>New Slot</span>
          </button>
          </>
          )
        }
      />

      {/* Status KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
            Total Slots
          </span>
          <span className="text-xl font-bold font-mono text-white mt-1 block">
            {totalSlots}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
          <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider block flex items-center gap-1">
            <CheckCircle className="size-3" /> Available
          </span>
          <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
            {availableSlots}
          </span>
        </div>

        <div className={`p-3.5 rounded-2xl border transition-all ${
          heldSlots > 0
            ? "border-amber-500/40 bg-amber-500/10 shadow-lg shadow-amber-500/10"
            : "border-zinc-800 bg-[#0d0d10]"
        }`}>
          <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider block flex items-center gap-1">
            <Clock className="size-3" /> In Hold
          </span>
          <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">
            {heldSlots}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl border border-blue-500/20 bg-blue-500/5">
          <span className="text-[11px] font-mono text-blue-400 uppercase tracking-wider block flex items-center gap-1">
            <UserCheck className="size-3" /> Awaiting verification
          </span>
          <span className="text-xl font-bold font-mono text-blue-400 mt-1 block">
            {pendingSlots}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl border border-purple-500/20 bg-purple-500/5">
          <span className="text-[11px] font-mono text-purple-400 uppercase tracking-wider block flex items-center gap-1">
            <Calendar className="size-3" /> Booked
          </span>
          <span className="text-xl font-bold font-mono text-purple-400 mt-1 block">
            {bookedSlots}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block flex items-center gap-1">
            <Lock className="size-3" /> Blocked
          </span>
          <span className="text-xl font-bold font-mono text-zinc-400 mt-1 block">
            {blockedSlots}
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div role="group" aria-label="Calendar view" className="inline-flex self-start rounded-xl border border-zinc-800 bg-zinc-900 p-0.5 shrink-0">
          {([
            ["month", "Month", CalendarDays],
            ["list", "List", List],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => chooseView(id)}
              aria-pressed={view === id}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-9 rounded-lg text-xs font-mono transition-colors ${
                view === id ? "bg-amber-500/15 text-amber-400" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by time, campaign, client name..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {view === "list" && (
          <div className="w-44">
            <DatePicker
              value={dateFilter}
              onChange={setDateFilter}
              placeholder="Filter by date"
              clearable
              title="Filter by exact date"
            />
          </div>
          )}

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="ALL">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="HELD">Held (Checkout)</option>
            <option value="PENDING_VERIFICATION">Awaiting verification</option>
            <option value="BOOKED">Booked</option>
            <option value="BLOCKED">Blocked</option>
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.badgeIcon ? `${c.badgeIcon} ` : ""}{c.name}
              </option>
            ))}
          </select>

          {view === "list" && (
          <label className="flex items-center gap-2 text-xs text-zinc-400 px-1 min-h-11 cursor-pointer">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(e) => setShowPast(e.target.checked)}
              className="rounded border-zinc-600 text-amber-500 focus:ring-0 size-4"
            />
            Show past slots
          </label>
          )}

          {(searchQuery || selectedStatus !== "ALL" || selectedCategory !== "ALL" || dateFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedStatus("ALL");
                setSelectedCategory("ALL");
                setDateFilter("");
              }}
              className="text-xs font-mono text-amber-400 hover:underline px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {view === "month" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start">
          <MonthView
            shown={shownMonth}
            onShowMonth={setShownMonth}
            summaries={summaries}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            today={today}
          />
          <section aria-labelledby="calendar-day-title" className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="calendar-day-title" className="text-sm font-semibold text-white">
                {formatSlotDate(`${selectedDay}T00:00:00.000Z`, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </h2>
              <span className="text-xs font-mono text-zinc-400">
                {selectedSummary
                  ? `${selectedSummary.total} slot${selectedSummary.total === 1 ? "" : "s"} · ${selectedSummary.open} open · ${selectedSummary.booked} booked`
                  : "No slots"}
              </span>
            </div>
            {daySlots.length > 0 ? (
              <SlotTable
                key={selectedDay}
                slots={daySlots}
                tenantId={tenantId}
                tenantSlug={tenantSlug}
                currency={currency}
                categories={categories}
                canManage={canManage}
                onEdit={(slot) => {
                  setSlotToEdit(slot);
                  setIsSingleDialogOpen(true);
                }}
                onForceRelease={(slot) => {
                  setSlotToRelease(slot);
                  setIsForceReleaseOpen(true);
                }}
                onBookForCustomer={(slot) => {
                  setSlotToBook(slot);
                  setIsBookDialogOpen(true);
                }}
                onViewBooking={handleViewBooking}
                onSuccess={handleSuccess}
              />
            ) : (
              <div className="p-8 text-center rounded-2xl border border-zinc-800 bg-[#0d0d10] space-y-1">
                <p className="text-sm text-zinc-300">
                  No slots on this day{selectedStatus !== "ALL" || selectedCategory !== "ALL" || searchQuery ? " that match the filters" : ""}.
                </p>
                {canManage && (
                  <p className="text-xs text-zinc-400">Use &quot;New Slot&quot; or &quot;Batch Generate&quot; to open times for clients to book.</p>
                )}
              </div>
            )}
          </section>
        </div>
      ) : (
      <SlotTable
        slots={filteredSlots}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        currency={currency}
        categories={categories}
        canManage={canManage}
        onEdit={(slot) => {
          setSlotToEdit(slot);
          setIsSingleDialogOpen(true);
        }}
        onForceRelease={(slot) => {
          setSlotToRelease(slot);
          setIsForceReleaseOpen(true);
        }}
        onBookForCustomer={(slot) => {
          setSlotToBook(slot);
          setIsBookDialogOpen(true);
        }}
        onViewBooking={handleViewBooking}
        onSuccess={handleSuccess}
      />
      )}

      <BookingDetailsDialog
        isOpen={viewBooking.open}
        onClose={closeBookingDetails}
        tenantSlug={tenantSlug}
        currency={currency}
        booking={viewBooking.booking}
        loading={viewBooking.loading}
        error={viewBooking.error}
        tenantId={tenantId}
        canManage={canManage}
        canRecordPayments={canRecordPayments}
        actionPowers={actionPowers}
        assignable={assignable}
        onChanged={reloadViewedBooking}
      />

      <BookForCustomerDialog
        canRecordPayments={canRecordPayments}
        isOpen={isBookDialogOpen}
        onClose={() => setIsBookDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        slot={slotToBook}
        clients={clients}
        packages={packages}
        currency={currency}
        onSuccess={handleSuccess}
      />

      {/* Dialog Modals */}
      <SingleSlotDialog
        canSetPrices={canSetPrices}
        isOpen={isSingleDialogOpen}
        onClose={() => setIsSingleDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        currency={currency}
        categories={categories}
        slotToEdit={slotToEdit}
        packages={packages}
        onSuccess={handleSuccess}
      />

      <BatchGeneratorDialog
        canSetPrices={canSetPrices}
        isOpen={isBatchDialogOpen}
        onClose={() => setIsBatchDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        currency={currency}
        categories={categories}
        packages={packages}
        onSuccess={handleSuccess}
      />

      <ForceReleaseDialog
        isOpen={isForceReleaseOpen}
        onClose={() => setIsForceReleaseOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        slot={slotToRelease}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

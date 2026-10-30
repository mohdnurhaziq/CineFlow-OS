"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Plus,
  Sparkles,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
  Clock,
  Lock,
  UserCheck,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cleanupExpiredHolds } from "@/lib/actions/admin-calendar";
import { SingleSlotDialog, type BookingSlotRow, type CategoryOption } from "./single-slot-dialog";
import { BatchGeneratorDialog } from "./batch-generator-dialog";
import { ForceReleaseDialog } from "./force-release-dialog";
import { SlotTable } from "./slot-table";

interface CalendarAdminDashboardProps {
  tenantId: string;
  tenantSlug: string;
  currency: string;
  initialSlots: BookingSlotRow[];
  categories: CategoryOption[];
}

export function CalendarAdminDashboard({
  tenantId,
  tenantSlug,
  currency,
  initialSlots,
  categories,
}: CalendarAdminDashboardProps) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [dateFilter, setDateFilter] = useState<string>("");

  // Dialogs
  const [isSingleDialogOpen, setIsSingleDialogOpen] = useState(false);
  const [slotToEdit, setSlotToEdit] = useState<BookingSlotRow | null>(null);

  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);

  const [isForceReleaseOpen, setIsForceReleaseOpen] = useState(false);
  const [slotToRelease, setSlotToRelease] = useState<BookingSlotRow | null>(null);

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
  const availableSlots = initialSlots.filter((s) => s.status === "AVAILABLE").length;
  const heldSlots = initialSlots.filter((s) => s.status === "HELD").length;
  const pendingSlots = initialSlots.filter((s) => s.status === "PENDING_VERIFICATION").length;
  const bookedSlots = initialSlots.filter((s) => s.status === "BOOKED").length;
  const blockedSlots = initialSlots.filter((s) => s.status === "BLOCKED").length;

  // Filter slots
  const filteredSlots = initialSlots.filter((slot) => {
    const dateStr = new Date(slot.date).toISOString().split("T")[0];
    const matchesSearch =
      slot.startTime.toLowerCase().includes(searchQuery.toLowerCase()) ||
      slot.endTime.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (slot.campaignTitle && slot.campaignTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (slot.booking && slot.booking.clientName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = selectedStatus === "ALL" || slot.status === selectedStatus;
    const matchesCategory = selectedCategory === "ALL" || slot.category === selectedCategory;
    const matchesDate = !dateFilter || dateStr === dateFilter;

    return matchesSearch && matchesStatus && matchesCategory && matchesDate;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Calendar className="size-6 text-amber-400" />
            <span>Calendar Slots & Holding Engine</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Dynamic calendar inventory, algorithmic batch scheduling, 10-minute slot holding leases, and blackout maintenance.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleCleanup}
            disabled={isCleaning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono text-zinc-300 bg-zinc-900 border border-zinc-700 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Release any slots whose 10-minute hold window expired"
          >
            <RefreshCw className={`size-3.5 ${isCleaning ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Clean Expired Holds</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBatchDialogOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono font-medium bg-zinc-900 text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 transition-colors"
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
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/10"
          >
            <Plus className="size-4" />
            <span>New Slot</span>
          </button>
        </div>
      </div>

      {/* Status KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
            Total Slots
          </span>
          <span className="text-xl font-bold font-mono text-white mt-1 block">
            {totalSlots}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block flex items-center gap-1">
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
          <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider block flex items-center gap-1">
            <Clock className="size-3" /> In Hold
          </span>
          <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">
            {heldSlots}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl border border-blue-500/20 bg-blue-500/5">
          <span className="text-[10px] font-mono text-blue-400 uppercase tracking-wider block flex items-center gap-1">
            <UserCheck className="size-3" /> Pending Verif
          </span>
          <span className="text-xl font-bold font-mono text-blue-400 mt-1 block">
            {pendingSlots}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl border border-purple-500/20 bg-purple-500/5">
          <span className="text-[10px] font-mono text-purple-400 uppercase tracking-wider block flex items-center gap-1">
            <Calendar className="size-3" /> Booked
          </span>
          <span className="text-xl font-bold font-mono text-purple-400 mt-1 block">
            {bookedSlots}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block flex items-center gap-1">
            <Lock className="size-3" /> Blocked
          </span>
          <span className="text-xl font-bold font-mono text-zinc-400 mt-1 block">
            {blockedSlots}
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by time, campaign, client name..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-mono focus:outline-none focus:border-amber-500 transition-colors"
            title="Filter by exact date"
          />

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="ALL">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="HELD">Held (Checkout)</option>
            <option value="PENDING_VERIFICATION">Pending Verification</option>
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

      {/* Filtered Slots Table */}
      <SlotTable
        slots={filteredSlots}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        currency={currency}
        categories={categories}
        onEdit={(slot) => {
          setSlotToEdit(slot);
          setIsSingleDialogOpen(true);
        }}
        onForceRelease={(slot) => {
          setSlotToRelease(slot);
          setIsForceReleaseOpen(true);
        }}
        onSuccess={handleSuccess}
      />

      {/* Dialog Modals */}
      <SingleSlotDialog
        isOpen={isSingleDialogOpen}
        onClose={() => setIsSingleDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        currency={currency}
        categories={categories}
        slotToEdit={slotToEdit}
        onSuccess={handleSuccess}
      />

      <BatchGeneratorDialog
        isOpen={isBatchDialogOpen}
        onClose={() => setIsBatchDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        currency={currency}
        categories={categories}
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

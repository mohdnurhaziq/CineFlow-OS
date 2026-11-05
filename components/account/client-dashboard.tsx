"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CalendarPlus,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  FolderLock,
  Heart,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  Lock,
  LockOpen,
  MapPin,
  Receipt,
  Sparkles,
  User,
  Video,
  Wallet,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";
import type { ClientBooking, BookingSlot, MilestoneInvoice, Proposal } from "@prisma/client";
import { LogoutButton } from "./logout-button";
import { formatMoney } from "@/lib/money";
import { milestoneLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

type BookingRow = ClientBooking & {
  slot: BookingSlot | null;
  project?: { id: string; title: string; projectNumber: string; status: string } | null;
};

interface DeliverableItemRow {
  id: string;
  title: string;
  itemType: string;
  previewUrl: string;
  thumbnailUrl: string | null;
  isClientFav: boolean;
}

interface ProjectRow {
  id: string;
  title: string;
  projectNumber: string;
  status: string;
  isFinalBalancePaid: boolean;
  booking?: {
    id: string;
    trackingCode: string;
    category: string;
    sessionPrice: number | null;
    depositAmount: number;
    slot: { date: Date; startTime: string; endTime: string } | null;
  } | null;
  deliverables: {
    status: string;
    items: DeliverableItemRow[];
  }[];
  callSheets: {
    title: string;
    shootDate: Date;
    generalCallTime: string;
    locationName: string;
    locationAddress?: string | null;
  }[];
}

interface InvoiceRow extends MilestoneInvoice {
  project?: { id: string; title: string; projectNumber?: string } | null;
  booking?: { id: string; trackingCode: string; category?: string } | null;
}

interface ClientDashboardProps {
  tenant: { name: string; slug: string; currency: string };
  client: { name: string; email: string; phone: string | null };
  bookings: BookingRow[];
  invoices: InvoiceRow[];
  proposals: Proposal[];
  projects: ProjectRow[];
}

const STAGES = [
  { id: "PRE_PRODUCTION", label: "Planning", icon: CalendarClock },
  { id: "PRODUCTION", label: "Shoot Day", icon: Camera },
  { id: "POST_PRODUCTION", label: "Color & Edit", icon: Sparkles },
  { id: "IN_REVIEW", label: "Client Proofing", icon: Eye },
  { id: "DELIVERED", label: "Delivered", icon: CheckCircle2 },
];

const BOOKING_STATUS_TEXT: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "Confirmed", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  PENDING: { label: "Awaiting Verification", className: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  COMPLETED: { label: "Session Done", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  DELIVERED: { label: "Delivered", className: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  NO_SHOW: { label: "Missed", className: "bg-zinc-800 text-zinc-400 border-zinc-700" },
  CANCELLED: { label: "Cancelled", className: "bg-zinc-800 text-zinc-400 border-zinc-700" },
};

function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ClientDashboard({ tenant, client, bookings, invoices, proposals, projects }: ClientDashboardProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "projects" | "bookings" | "invoices" | "proposals">("overview");
  const [bookingFilter, setBookingFilter] = useState<"all" | "upcoming" | "past">("all");
  const [invoiceFilter, setInvoiceFilter] = useState<"unpaid" | "paid" | "all">("all");
  const [showVoidInvoices, setShowVoidInvoices] = useState(false);

  const money = (amount: number) => formatMoney(tenant.currency, amount);
  const formatDate = (d: Date | string) => {
    const dateObj = typeof d === "string" ? new Date(d) : d;
    return dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatShortDate = (d: Date | string) => {
    const dateObj = typeof d === "string" ? new Date(d) : d;
    return {
      month: dateObj.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      day: dateObj.getDate(),
      weekday: dateObj.toLocaleDateString("en-US", { weekday: "short" }),
    };
  };

  // Financial calculations
  const unpaidInvoices = useMemo(
    () => invoices.filter((i) => i.status === "PENDING" || i.status === "OVERDUE"),
    [invoices]
  );
  const paidInvoices = useMemo(() => invoices.filter((i) => i.status === "PAID"), [invoices]);
  const voidInvoices = useMemo(
    () => invoices.filter((i) => i.status === "VOID" || i.status === "CANCELLED" || i.status === "REJECTED"),
    [invoices]
  );
  const outstanding = useMemo(() => unpaidInvoices.reduce((sum, i) => sum + i.amount, 0), [unpaidInvoices]);

  // Bookings filtering
  const nowTime = Date.now() - 86400000;
  const upcomingBookings = useMemo(
    () => bookings.filter((b) => b.status !== "CANCELLED" && b.slot && new Date(b.slot.date).getTime() >= nowTime),
    [bookings, nowTime]
  );
  const pastBookings = useMemo(
    () => bookings.filter((b) => b.status === "CANCELLED" || (b.slot && new Date(b.slot.date).getTime() < nowTime)),
    [bookings, nowTime]
  );

  const visibleBookings = useMemo(() => {
    if (bookingFilter === "upcoming") return upcomingBookings;
    if (bookingFilter === "past") return pastBookings;
    return bookings;
  }, [bookingFilter, bookings, upcomingBookings, pastBookings]);

  // Next shoot determination
  const nextShoot = useMemo(() => {
    const allCallSheets = projects
      .flatMap((p) => p.callSheets.map((cs) => ({ ...cs, projectId: p.id, projectTitle: p.title })))
      .sort((a, b) => new Date(a.shootDate).getTime() - new Date(b.shootDate).getTime());
    return allCallSheets[0] || null;
  }, [projects]);

  const shootDaysRemaining = useMemo(() => {
    if (!nextShoot) return null;
    const diff = Math.ceil((new Date(nextShoot.shootDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [nextShoot]);

  // Media calculations
  const totalDeliverablesCount = useMemo(
    () => projects.reduce((sum, p) => sum + p.deliverables.reduce((s, d) => s + d.items.length, 0), 0),
    [projects]
  );

  // Spotlight project for Overview tab
  const spotlightProject = useMemo(() => {
    if (projects.length === 0) return null;
    const withUpcoming = projects.find((p) => p.callSheets.length > 0);
    return withUpcoming || projects[0];
  }, [projects]);

  const spotlightNextShoot = useMemo(
    () => spotlightProject?.callSheets[0] || null,
    [spotlightProject]
  );

  const spotlightStageIndex = useMemo(
    () => (spotlightProject ? Math.max(0, STAGES.findIndex((s) => s.id === spotlightProject.status)) : 0),
    [spotlightProject]
  );

  // Invoices to show based on filter
  const visibleInvoices = useMemo(() => {
    let list: InvoiceRow[] = [];
    if (invoiceFilter === "unpaid") {
      list = unpaidInvoices;
    } else if (invoiceFilter === "paid") {
      list = paidInvoices;
    } else {
      list = showVoidInvoices ? invoices : invoices.filter((i) => i.status !== "VOID" && i.status !== "CANCELLED");
    }
    return list;
  }, [invoiceFilter, unpaidInvoices, paidInvoices, invoices, showVoidInvoices]);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      {/* Top Header */}
      <header className="border-b border-zinc-800 bg-[#121215]/95 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/${tenant.slug}`}
              className="size-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 hover:bg-amber-500/20 transition-colors"
              title="Return to Studio Showcase"
            >
              <Camera className="size-4.5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/${tenant.slug}`}
                  className="text-[11px] font-mono uppercase tracking-widest text-amber-400 hover:underline"
                >
                  {tenant.name}
                </Link>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  Client Hub
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>Welcome back, {client.name.split(" ")[0]}</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href={`/${tenant.slug}/book`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono tracking-wide transition-all shadow-sm shadow-amber-500/10"
            >
              <CalendarPlus className="size-3.5" />
              <span>Book Session</span>
            </Link>
            <Link
              href={`/${tenant.slug}`}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-mono transition-colors"
            >
              <span>Showcase</span>
              <ArrowUpRight className="size-3 text-zinc-500" />
            </Link>
            <div className="h-4 w-px bg-zinc-800 hidden sm:block" />
            <LogoutButton redirectTo={`/${tenant.slug}`} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Priority 1: High-Visibility Action Notification Banner */}
        {outstanding > 0 && unpaidInvoices[0] ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg shadow-amber-500/5 animate-in fade-in-0 duration-300">
            <div className="flex items-start gap-3.5">
              <div className="size-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                <CreditCard className="size-4.5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white text-sm">
                    Outstanding Balance: {money(outstanding)}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold uppercase">
                    Action Required
                  </span>
                </div>
                <p className="text-xs text-zinc-300 max-w-xl">
                  {unpaidInvoices[0].project?.title
                    ? `Balance for ${unpaidInvoices[0].project.title} (${milestoneLabel(unpaidInvoices[0].milestoneType)}). Clearing this unlocks full-resolution downloads when your deliverables are ready.`
                    : `You have ${unpaidInvoices.length} pending ${unpaidInvoices.length === 1 ? "invoice" : "invoices"} due. Settle now via online gateway or QR transfer.`}
                </p>
              </div>
            </div>
            <Link
              href={`/${tenant.slug}/checkout?invoiceId=${unpaidInvoices[0].id}`}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono tracking-wider transition-all shadow-md shadow-amber-500/20 whitespace-nowrap self-start sm:self-auto"
            >
              <span>Pay Now ({money(outstanding)})</span>
              <ChevronRight className="size-4" />
            </Link>
          </div>
        ) : nextShoot ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-in fade-in-0 duration-300">
            <div className="flex items-start gap-3.5">
              <div className="size-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0 mt-0.5">
                <CalendarClock className="size-4.5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white text-sm">
                    Next Shoot: {nextShoot.projectTitle}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold">
                    {shootDaysRemaining === 0
                      ? "Today!"
                      : shootDaysRemaining === 1
                      ? "Tomorrow"
                      : shootDaysRemaining !== null && shootDaysRemaining > 1
                      ? `In ${shootDaysRemaining} days`
                      : "Upcoming"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300 font-mono">
                  <span>📅 {formatDate(nextShoot.shootDate)}</span>
                  <span>⏰ Call time {nextShoot.generalCallTime}</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3 text-zinc-400" />
                    {nextShoot.locationName}
                  </span>
                </div>
              </div>
            </div>
            {nextShoot.projectId && (
              <Link
                href={`/${tenant.slug}/vault/${nextShoot.projectId}`}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono transition-colors whitespace-nowrap self-start sm:self-auto"
              >
                <span>View Vault</span>
                <ChevronRight className="size-3 text-zinc-400" />
              </Link>
            )}
          </div>
        ) : null}

        {/* Top 3 Quick Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: Upcoming Sessions */}
          <button
            type="button"
            onClick={() => setActiveTab("bookings")}
            className="p-4 rounded-xl bg-[#121215] border border-zinc-800/80 hover:border-zinc-700 transition-all text-left group"
          >
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-[11px] font-mono uppercase tracking-wider group-hover:text-zinc-200 transition-colors">
                Upcoming Sessions
              </span>
              <CalendarClock className="size-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-white tabular-nums">
              {upcomingBookings.length}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {upcomingBookings.length > 0
                ? `${upcomingBookings.length} active shoot${upcomingBookings.length === 1 ? "" : "s"} scheduled`
                : "No upcoming shoots"}
            </p>
          </button>

          {/* Card 2: Account Balance */}
          <button
            type="button"
            onClick={() => setActiveTab("invoices")}
            className="p-4 rounded-xl bg-[#121215] border border-zinc-800/80 hover:border-zinc-700 transition-all text-left group"
          >
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-[11px] font-mono uppercase tracking-wider group-hover:text-zinc-200 transition-colors">
                Balance Due
              </span>
              <Wallet className="size-4 text-amber-400" />
            </div>
            <div
              className={cn(
                "mt-2 text-2xl font-black tabular-nums",
                outstanding > 0 ? "text-amber-400" : "text-emerald-400"
              )}
            >
              {money(outstanding)}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {outstanding > 0 ? `${unpaidInvoices.length} invoice awaiting payment` : "All invoices settled & clear"}
            </p>
          </button>

          {/* Card 3: Photos & Videos */}
          <button
            type="button"
            onClick={() => setActiveTab("projects")}
            className="p-4 rounded-xl bg-[#121215] border border-zinc-800/80 hover:border-zinc-700 transition-all text-left group"
          >
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-[11px] font-mono uppercase tracking-wider group-hover:text-zinc-200 transition-colors">
                Gallery Deliverables
              </span>
              <Camera className="size-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-white tabular-nums">
              {totalDeliverablesCount}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {totalDeliverablesCount > 0
                ? `${totalDeliverablesCount} photos & videos in vault`
                : "Delivered after shoot day"}
            </p>
          </button>
        </div>

        {/* Section Navigation Tabs */}
        <div className="border-b border-zinc-800 flex items-center gap-1 overflow-x-auto scrollbar-none pb-px">
          {[
            { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
            { id: "projects" as const, label: `Shoots & Vault (${projects.length})`, icon: FolderLock },
            { id: "bookings" as const, label: `Bookings (${bookings.length})`, icon: CalendarClock },
            { id: "invoices" as const, label: `Invoices & Receipts (${invoices.length})`, icon: Receipt },
            ...(proposals.length > 0
              ? [{ id: "proposals" as const, label: `Proposals (${proposals.length})`, icon: FileText }]
              : []),
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2.5 text-xs font-mono transition-colors border-b-2 whitespace-nowrap",
                  isActive
                    ? "border-amber-400 text-amber-400 font-bold"
                    : "border-transparent text-zinc-400 hover:text-white hover:border-zinc-700"
                )}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ======================================================== */}
        {/* TAB 1: OVERVIEW DIGEST (EXECUTIVE SNAPSHOT)                */}
        {/* ======================================================== */}
        {activeTab === "overview" && (
          <div className="space-y-5 animate-in fade-in-0 duration-200">
            {/* Spotlight Current Production */}
            {spotlightProject ? (
              <div className="p-5 rounded-2xl bg-[#121215] border border-zinc-800/90 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase">
                      Current Engagement
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">
                      {spotlightProject.projectNumber}
                    </span>
                  </div>
                  {projects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("projects")}
                      className="text-xs font-mono text-amber-400 hover:underline flex items-center gap-0.5"
                    >
                      View all {projects.length} shoots <ChevronRight className="size-3" />
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white tracking-tight">
                      {spotlightProject.title}
                    </h3>
                    {spotlightNextShoot ? (
                      <p className="text-xs text-zinc-300 font-mono flex items-center gap-1.5 flex-wrap">
                        <CalendarClock className="size-3.5 text-amber-400" />
                        <span>Next shoot: {formatDate(spotlightNextShoot.shootDate)} · {spotlightNextShoot.generalCallTime}</span>
                        <span className="text-zinc-500">· {spotlightNextShoot.locationName}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-400 font-mono">
                        Stage: {STAGES[spotlightStageIndex]?.label || "Planning"}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/${tenant.slug}/vault/${spotlightProject.id}`}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono tracking-wide transition-all shadow-sm self-start sm:self-auto"
                  >
                    <FolderLock className="size-3.5" />
                    <span>Open Photo Vault</span>
                    <ChevronRight className="size-3.5" />
                  </Link>
                </div>

                {/* Compact Stage Timeline */}
                <div className="bg-[#18181c] p-3.5 rounded-xl border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-zinc-400 uppercase tracking-wider">Production Timeline</span>
                    <span className="text-amber-400 font-semibold">
                      Stage {spotlightStageIndex + 1} of 5: {STAGES[spotlightStageIndex]?.label}
                    </span>
                  </div>
                  <ol className="grid grid-cols-5 gap-1.5" aria-label="Stage timeline">
                    {STAGES.map((s, idx) => (
                      <li key={s.id} className="space-y-1">
                        <div
                          className={cn(
                            "h-1.5 rounded-full transition-all",
                            idx < spotlightStageIndex
                              ? "bg-amber-400"
                              : idx === spotlightStageIndex
                              ? "bg-amber-500 animate-pulse"
                              : "bg-zinc-800"
                          )}
                        />
                        <div
                          className={cn(
                            "text-[10px] font-mono truncate",
                            idx === spotlightStageIndex
                              ? "text-amber-300 font-bold"
                              : idx < spotlightStageIndex
                              ? "text-zinc-300"
                              : "text-zinc-600"
                          )}
                        >
                          {s.label}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : null}

            {/* Side-by-side Quick Summaries for Bookings and Invoices */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Box 1: Next Bookings Snapshot */}
              <div className="p-5 rounded-2xl bg-[#121215] border border-zinc-800 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="size-4 text-amber-400" />
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        Upcoming Sessions
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("bookings")}
                      className="text-[11px] font-mono text-amber-400 hover:underline flex items-center gap-0.5"
                    >
                      All ({bookings.length}) <ChevronRight className="size-3" />
                    </button>
                  </div>

                  {upcomingBookings.length === 0 ? (
                    <div className="py-4 text-center space-y-2">
                      <p className="text-xs text-zinc-500">No upcoming sessions right now.</p>
                      <Link
                        href={`/${tenant.slug}/book`}
                        className="inline-flex items-center gap-1 text-xs font-mono text-amber-400 hover:underline"
                      >
                        + Book a session
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {upcomingBookings.slice(0, 2).map((b) => {
                        const dateInfo = b.slot ? formatShortDate(b.slot.date) : null;
                        return (
                          <div
                            key={b.id}
                            className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex items-center justify-between text-xs font-mono"
                          >
                            <div className="flex items-center gap-3">
                              {dateInfo && (
                                <div className="size-10 rounded-lg bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-center text-center flex-shrink-0">
                                  <span className="text-[8px] uppercase text-amber-400 font-bold leading-none">
                                    {dateInfo.month}
                                  </span>
                                  <span className="text-sm font-black text-white leading-tight">
                                    {dateInfo.day}
                                  </span>
                                </div>
                              )}
                              <div className="space-y-0.5">
                                <div className="font-semibold text-white">
                                  {humanize(b.category)}
                                </div>
                                <div className="text-[11px] text-zinc-400">
                                  {b.slot ? `${b.slot.startTime} – ${b.slot.endTime}` : "Time confirmed"}
                                </div>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Confirmed
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab("bookings")}
                  className="w-full text-center py-2 text-xs font-mono text-zinc-400 hover:text-white bg-zinc-900/50 hover:bg-zinc-800/60 rounded-xl border border-zinc-800 transition-colors flex items-center justify-center gap-1"
                >
                  <span>Manage all {bookings.length} bookings</span>
                  <ChevronRight className="size-3 text-amber-400" />
                </button>
              </div>

              {/* Box 2: Billing & Recent Invoices Snapshot */}
              <div className="p-5 rounded-2xl bg-[#121215] border border-zinc-800 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Receipt className="size-4 text-amber-400" />
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        Billing & Receipts
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("invoices")}
                      className="text-[11px] font-mono text-amber-400 hover:underline flex items-center gap-0.5"
                    >
                      All ({invoices.length}) <ChevronRight className="size-3" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {unpaidInvoices.length > 0 ? (
                      unpaidInvoices.slice(0, 1).map((inv) => (
                        <div
                          key={inv.id}
                          className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs font-mono"
                        >
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{inv.invoiceNumber}</span>
                              <span className="text-[10px] text-amber-300">({humanize(inv.milestoneType)})</span>
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              Due: {formatDate(inv.dueDate)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-amber-400">{money(inv.amount)}</div>
                            <Link
                              href={`/${tenant.slug}/checkout?invoiceId=${inv.id}`}
                              className="text-[10px] font-bold text-amber-300 hover:underline uppercase inline-flex items-center gap-0.5"
                            >
                              Pay Now →
                            </Link>
                          </div>
                        </div>
                      ))
                    ) : null}

                    {paidInvoices.slice(0, unpaidInvoices.length > 0 ? 1 : 2).map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex items-center justify-between text-xs font-mono"
                      >
                        <div>
                          <div className="font-semibold text-zinc-200">
                            {inv.invoiceNumber} · {humanize(inv.milestoneType)}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            Paid {inv.paidAt ? formatDate(inv.paidAt) : ""}
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <span className="font-bold text-white">{money(inv.amount)}</span>
                          <Link
                            href={`/${tenant.slug}/account/invoices/${inv.id}`}
                            className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                          >
                            Receipt
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab("invoices")}
                  className="w-full text-center py-2 text-xs font-mono text-zinc-400 hover:text-white bg-zinc-900/50 hover:bg-zinc-800/60 rounded-xl border border-zinc-800 transition-colors flex items-center justify-center gap-1"
                >
                  <span>View all {invoices.length} invoices & receipts</span>
                  <ChevronRight className="size-3 text-amber-400" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: SHOOTS & VAULT (FULL DETAILED VIEW)                */}
        {/* ======================================================== */}
        {activeTab === "projects" && (
          <section className="space-y-4 animate-in fade-in-0 duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <FolderLock className="size-4 text-amber-400" />
                  Your Production Projects & Deliverables Vault ({projects.length})
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Follow production stages from planning to final retouch selects and high-resolution master downloads.
                </p>
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#121215] border border-zinc-800 text-center space-y-2">
                <Camera className="size-8 text-zinc-600 mx-auto" />
                <h3 className="text-sm font-bold text-zinc-300">No active projects yet</h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  When you book a production session (like a Wedding, Commercial, or Brand film), your project cockpit and deliverables vault activate here.
                </p>
                <Link
                  href={`/${tenant.slug}/book`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold font-mono mt-2"
                >
                  <CalendarPlus className="size-3.5" /> Book a session
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {projects.map((p) => {
                  const stageIndex = Math.max(0, STAGES.findIndex((s) => s.id === p.status));
                  const items = p.deliverables.flatMap((d) => d.items);
                  const photos = items.filter((i) => i.itemType === "PHOTO").length;
                  const videos = items.filter((i) => i.itemType === "VIDEO").length;
                  const favs = items.filter((i) => i.isClientFav).length;
                  const nextShootDay = p.callSheets[0];
                  const previewThumbnails = items.filter((i) => i.previewUrl || i.thumbnailUrl).slice(0, 4);

                  return (
                    <div
                      key={p.id}
                      className="p-5 rounded-2xl bg-[#121215] border border-zinc-800/90 hover:border-zinc-700/80 transition-all space-y-4 shadow-sm"
                    >
                      {/* Project Header */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-white tracking-tight">{p.title}</h3>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                              {p.projectNumber}
                            </span>
                          </div>
                          {p.booking && (
                            <p className="text-xs text-zinc-400 font-mono mt-0.5">
                              Booking {p.booking.trackingCode} · {humanize(p.booking.category)}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-wide uppercase border",
                              p.status === "DELIVERED"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            )}
                          >
                            {humanize(p.status)}
                          </span>
                        </div>
                      </div>

                      {/* 5-Stage Interactive Progress Bar */}
                      <div className="bg-[#18181c] p-4 rounded-xl border border-zinc-800/80 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-zinc-400 text-[11px] uppercase tracking-wider">
                            Production Stage
                          </span>
                          <span className="text-amber-400 font-semibold">
                            Stage {stageIndex + 1} of 5: {STAGES[stageIndex]?.label || "Planning"}
                          </span>
                        </div>

                        <ol className="grid grid-cols-5 gap-1.5 sm:gap-2" aria-label="Project stage progress">
                          {STAGES.map((s, idx) => {
                            const isCompleted = idx < stageIndex;
                            const isCurrent = idx === stageIndex;
                            const isFuture = idx > stageIndex;
                            const StageIcon = s.icon;

                            return (
                              <li key={s.id} className="space-y-1.5">
                                <div
                                  className={cn(
                                    "h-1.5 rounded-full transition-all",
                                    isCompleted
                                      ? "bg-amber-400"
                                      : isCurrent
                                      ? "bg-amber-500 animate-pulse"
                                      : "bg-zinc-800"
                                  )}
                                />
                                <div
                                  className={cn(
                                    "text-[10px] font-mono flex items-center gap-1 truncate",
                                    isCurrent
                                      ? "text-amber-300 font-bold"
                                      : isCompleted
                                      ? "text-zinc-300"
                                      : "text-zinc-600"
                                  )}
                                >
                                  {isCompleted ? (
                                    <Check className="size-2.5 text-amber-400 flex-shrink-0" />
                                  ) : (
                                    <StageIcon className="size-2.5 flex-shrink-0" />
                                  )}
                                  <span className="truncate">{s.label}</span>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </div>

                      {/* Shoot Day Info or Deliverables Grid */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
                        <div className="space-y-2 flex-1">
                          {items.length > 0 ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-3 text-xs font-mono text-zinc-300">
                                <span className="flex items-center gap-1.5">
                                  <ImageIcon className="size-3.5 text-amber-400" />
                                  {photos} photo{photos === 1 ? "" : "s"}
                                </span>
                                {videos > 0 && (
                                  <span className="flex items-center gap-1.5">
                                    <Video className="size-3.5 text-blue-400" />
                                    {videos} video{videos === 1 ? "" : "s"}
                                  </span>
                                )}
                                {favs > 0 && (
                                  <span className="flex items-center gap-1 text-rose-400">
                                    <Heart className="size-3 fill-rose-500" />
                                    {favs} favorited
                                  </span>
                                )}
                              </div>

                              {previewThumbnails.length > 0 && (
                                <div className="flex items-center gap-2">
                                  {previewThumbnails.map((item) => (
                                    <div
                                      key={item.id}
                                      className="size-14 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden relative group/thumb"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={item.thumbnailUrl || item.previewUrl}
                                        alt={item.title}
                                        className="size-full object-cover group-hover/thumb:scale-110 transition-transform"
                                      />
                                    </div>
                                  ))}
                                  {items.length > 4 && (
                                    <div className="size-14 rounded-lg bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-[11px] font-mono text-zinc-400">
                                      +{items.length - 4}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : nextShootDay ? (
                            <div className="flex items-start gap-2.5 text-xs text-zinc-300 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
                              <CalendarClock className="size-4 text-amber-400 flex-shrink-0 mt-0.5" />
                              <div className="space-y-0.5">
                                <div className="font-semibold text-white">
                                  Upcoming Shoot: {formatDate(nextShootDay.shootDate)} · {nextShootDay.generalCallTime}
                                </div>
                                <div className="text-[11px] text-zinc-400 font-mono">
                                  📍 {nextShootDay.locationName}
                                  {nextShootDay.locationAddress ? ` · ${nextShootDay.locationAddress}` : ""}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                              <Clock className="size-3.5 text-zinc-500" />
                              <span>Production in progress. Vault gallery will populate upon first upload.</span>
                            </div>
                          )}

                          {items.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs">
                              {p.isFinalBalancePaid ? (
                                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                                  <LockOpen className="size-3.5" />
                                  High-Res Masters Unlocked (Ready for Download)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-amber-400/90 font-medium">
                                  <Lock className="size-3.5" />
                                  Watermarked Proofing Previews (Masters unlock upon balance payment)
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex-shrink-0 flex items-center gap-2">
                          <Link
                            href={`/${tenant.slug}/vault/${p.id}`}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono tracking-wide transition-all shadow-md shadow-amber-500/10"
                          >
                            <FolderLock className="size-4" />
                            <span>Open Photo Vault</span>
                            <ChevronRight className="size-3.5" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ======================================================== */}
        {/* TAB 3: BOOKINGS (FULL DETAILED VIEW)                      */}
        {/* ======================================================== */}
        {activeTab === "bookings" && (
          <section className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4 animate-in fade-in-0 duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <CalendarClock className="size-4 text-amber-400" />
                  Your Session Bookings ({bookings.length})
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Scheduled time slots, venue locations, and booking confirmations.
                </p>
              </div>

              {/* Sub-filter pills */}
              <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800 self-start sm:self-auto text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setBookingFilter("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-colors",
                    bookingFilter === "all" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-white"
                  )}
                >
                  All ({bookings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBookingFilter("upcoming")}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-colors",
                    bookingFilter === "upcoming" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-white"
                  )}
                >
                  Upcoming ({upcomingBookings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBookingFilter("past")}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-colors",
                    bookingFilter === "past" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-white"
                  )}
                >
                  Past ({pastBookings.length})
                </button>
              </div>
            </div>

            {visibleBookings.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                No bookings match this filter.
              </p>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {visibleBookings.map((b) => {
                  const statusInfo = BOOKING_STATUS_TEXT[b.status] || {
                    label: b.status,
                    className: "bg-zinc-800 text-zinc-400 border-zinc-700",
                  };
                  const dateInfo = b.slot ? formatShortDate(b.slot.date) : null;

                  return (
                    <div
                      key={b.id}
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-zinc-900/20 -mx-2 px-2 rounded-xl transition-colors"
                    >
                      {/* Left: Date badge + category */}
                      <div className="flex items-start gap-3.5">
                        {dateInfo ? (
                          <div className="size-12 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center text-center flex-shrink-0 group-hover:border-zinc-700 transition-colors">
                            <span className="text-[9px] font-mono uppercase text-amber-400 font-bold leading-none">
                              {dateInfo.month}
                            </span>
                            <span className="text-base font-black text-white leading-tight font-mono">
                              {dateInfo.day}
                            </span>
                          </div>
                        ) : (
                          <div className="size-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 flex-shrink-0">
                            <CalendarClock className="size-5" />
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-sm">
                              {humanize(b.category)} Session
                            </span>
                            <span className="text-[11px] font-mono text-zinc-400">
                              {b.trackingCode}
                            </span>
                          </div>

                          <div className="text-xs text-zinc-400 font-mono flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {b.slot && (
                              <span>
                                ⏰ {b.slot.startTime} – {b.slot.endTime}
                              </span>
                            )}
                            <span>
                              Deposit: {money(b.depositAmount)} ({b.depositPaid ? "Paid" : "Unpaid"})
                            </span>
                          </div>

                          {b.status === "CANCELLED" && b.cancelReason && (
                            <p className="text-[11px] text-rose-400/90 font-mono">
                              Reason: {b.cancelReason}
                            </p>
                          )}

                          {b.project && (
                            <Link
                              href={`/${tenant.slug}/vault/${b.project.id}`}
                              className="text-[11px] text-amber-400 hover:underline inline-flex items-center gap-1 font-mono mt-0.5"
                            >
                              <span>View Linked Project & Vault</span>
                              <ChevronRight className="size-3" />
                            </Link>
                          )}
                        </div>
                      </div>

                      {/* Right: Status badge & delivery CTA */}
                      <div className="flex items-center gap-3 self-end sm:self-center">
                        {b.status === "DELIVERED" && b.deliveryUrl && (
                          <a
                            href={b.deliveryUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold font-mono hover:bg-amber-400 transition-colors"
                          >
                            <span>View Photos</span>
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-wide border uppercase",
                            statusInfo.className
                          )}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ======================================================== */}
        {/* TAB 4: INVOICES & BILLING (FULL DETAILED VIEW)            */}
        {/* ======================================================== */}
        {activeTab === "invoices" && (
          <section className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4 animate-in fade-in-0 duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Receipt className="size-4 text-amber-400" />
                  Invoices & Payment Receipts ({invoices.length})
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Milestone deposits, final balances, and official tax receipts for your sessions.
                </p>
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800 self-start sm:self-auto text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setInvoiceFilter("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-colors",
                    invoiceFilter === "all" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-white"
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceFilter("unpaid")}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-colors",
                    invoiceFilter === "unpaid" ? "bg-amber-500/20 text-amber-300 font-bold" : "text-zinc-400 hover:text-white"
                  )}
                >
                  Unpaid ({unpaidInvoices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceFilter("paid")}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-colors",
                    invoiceFilter === "paid" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-white"
                  )}
                >
                  Paid ({paidInvoices.length})
                </button>
              </div>
            </div>

            {visibleInvoices.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                {invoiceFilter === "unpaid" ? "Great news! You have zero unpaid invoices." : "No invoices recorded."}
              </p>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {visibleInvoices.map((inv) => {
                  const isUnpaid = inv.status === "PENDING" || inv.status === "OVERDUE";
                  const isPaid = inv.status === "PAID";
                  const isVoid = inv.status === "VOID" || inv.status === "CANCELLED";

                  return (
                    <div
                      key={inv.id}
                      className={cn(
                        "py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 -mx-2 px-2 rounded-xl transition-colors",
                        isUnpaid ? "bg-amber-500/5 border border-amber-500/20 my-1" : "hover:bg-zinc-900/20"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/${tenant.slug}/account/invoices/${inv.id}`}
                            className="font-mono text-xs font-bold text-white hover:text-amber-400 transition-colors underline decoration-zinc-700 underline-offset-2 flex items-center gap-1"
                          >
                            <span>{inv.invoiceNumber}</span>
                            <ArrowUpRight className="size-3 text-zinc-500" />
                          </Link>
                          <span className="text-xs text-zinc-300 font-medium">
                            · {humanize(inv.milestoneType)}
                          </span>
                        </div>

                        <div className="text-[11px] text-zinc-400 font-mono flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span>
                            {isPaid && inv.paidAt
                              ? `Paid ${formatDate(inv.paidAt)}`
                              : `Due ${formatDate(inv.dueDate)}`}
                          </span>
                          {inv.project && <span>Project: {inv.project.title}</span>}
                        </div>

                        {inv.status === "REJECTED" && (
                          <p className="text-[11px] text-rose-400 font-mono">
                            Payment proof not accepted{inv.rejectionReason ? `: ${inv.rejectionReason}` : ""}. Please upload a new slip within 24 hours.
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <span className="font-mono font-bold text-white text-sm tabular-nums">
                          {money(inv.amount)}
                        </span>

                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border",
                            isPaid
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : isUnpaid
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700"
                          )}
                        >
                          {inv.status}
                        </span>

                        {isPaid && (
                          <Link
                            href={`/${tenant.slug}/account/invoices/${inv.id}`}
                            className="px-2.5 py-1 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-xs font-mono transition-colors"
                          >
                            Receipt
                          </Link>
                        )}

                        {isUnpaid && (
                          <Link
                            href={`/${tenant.slug}/checkout?invoiceId=${inv.id}`}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono transition-colors shadow-sm"
                          >
                            Pay Now
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Voided attempts toggle */}
            {voidInvoices.length > 0 && !showVoidInvoices && invoiceFilter === "all" && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowVoidInvoices(true)}
                  className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Show {voidInvoices.length} cancelled / void payment attempts
                </button>
              </div>
            )}
          </section>
        )}

        {/* ======================================================== */}
        {/* TAB 5: PROPOSALS (FULL VIEW)                              */}
        {/* ======================================================== */}
        {activeTab === "proposals" && proposals.length > 0 && (
          <section className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4 animate-in fade-in-0 duration-200">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="size-4 text-amber-400" />
                Custom Project Proposals ({proposals.length})
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Official studio quotes, scope agreements, and digital signing contracts.
              </p>
            </div>

            <div className="divide-y divide-zinc-800/60">
              {proposals.map((p) => (
                <div
                  key={p.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 -mx-2 px-2 rounded-xl hover:bg-zinc-900/20 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-white text-sm">{p.title}</div>
                    <div className="font-mono text-xs text-zinc-400">
                      {p.proposalNumber} · Total Price: {money(p.totalPrice)}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase",
                        p.status === "ACCEPTED"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      )}
                    >
                      {p.status}
                    </span>
                    <Link
                      href={`/${tenant.slug}/proposals/${p.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-xs font-mono transition-colors"
                    >
                      <span>Review & Sign</span>
                      <ExternalLink className="size-3 text-amber-400" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="pt-6 border-t border-zinc-900 text-center space-y-1">
          <p className="text-xs font-mono text-zinc-500">
            Signed in as {client.email} · {tenant.name} Client Portal
          </p>
          <p className="text-[11px] text-zinc-600">
            Need changes to your shoot or deliverables? Contact studio support directly.
          </p>
        </footer>
      </main>
    </div>
  );
}

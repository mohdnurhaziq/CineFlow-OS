"use client";

import { chipClass, chipListClass } from "@/components/ui/tabs";
import { buttonVariants } from "@/components/ui/button";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarCheck,
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
  Image as ImageIcon,
  Lock,
  LockOpen,
  MapPin,
  Receipt,
  Sparkles,
  Video,
  Wallet,
  ArrowUpRight,
} from "lucide-react";
import type { ClientBooking, BookingSlot, MilestoneInvoice, Proposal } from "@prisma/client";
import { currencySymbol, formatMoney } from "@/lib/money";
import { FramedPrintsSection } from "@/components/prints/framed-prints-section";
import type { FramedPrintsData } from "@/lib/prints/gallery";
import { milestoneLabel, paymentMethodLabel } from "@/lib/labels";
import { clientPayAction, clientPayLabel, clientPayState, isOwed } from "@/lib/invoices/client-status";
import { categoryName } from "@/lib/bookings/category-name";
import { BOOKING_MILESTONES, PROPOSAL_MILESTONES, billSums, invoiceBookingId, invoiceProposalId } from "@/lib/invoices/bill-groups";
import { cn } from "@/lib/utils";
import { STUDIO_TIME_ZONE, formatSlotDate } from "@/lib/slot-time";
import { studioPath } from "@/lib/domain-name";

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
  /** Included prints and print orders; absent where the page doesn't load them. */
  framedPrints?: FramedPrintsData;
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
  booking?: {
    id: string;
    trackingCode: string;
    category?: string;
    packageName?: string | null;
    sessionPrice?: number | null;
    depositAmount?: number | null;
  } | null;
}

interface ClientDashboardProps {
  /** releaseFilesBeforePayment: the studio gives full-resolution files on upload, before the balance is paid. */
  tenant: { id: string; name: string; slug: string; currency: string; releaseFilesBeforePayment?: boolean };
  client: { name: string; email: string; phone: string | null };
  bookings: BookingRow[];
  invoices: InvoiceRow[];
  proposals: Proposal[];
  projects: ProjectRow[];
  /** The studio's categories, to show a booking's category by name. */
  categories: Array<{ slug: string; name: string }>;
  /** Shown above everything, e.g. the confirmation right after checkout. */
  banner?: React.ReactNode;
}

const STAGES = [
  { id: "PRE_PRODUCTION", label: "Planning", icon: CalendarClock },
  { id: "PRODUCTION", label: "Shoot day", icon: Camera },
  { id: "POST_PRODUCTION", label: "Editing", icon: Sparkles },
  { id: "IN_REVIEW", label: "Your review", icon: Eye },
  { id: "DELIVERED", label: "Delivered", icon: CheckCircle2 },
];

const PROPOSAL_STATUS_TEXT: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Ready to review",
  VIEWED: "Ready to review",
  ACCEPTED: "Signed",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

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

export function ClientDashboard({ tenant, client, bookings, invoices, proposals, projects, categories, banner }: ClientDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryTab = searchParams.get("tab");

  const [activeTab, setActiveTab] = useState<"overview" | "projects" | "bookings" | "invoices" | "proposals">(
    queryTab === "projects" || queryTab === "bookings" || queryTab === "invoices" || queryTab === "proposals"
      ? queryTab
      : "overview"
  );

  useEffect(() => {
    if (queryTab === "projects" || queryTab === "bookings" || queryTab === "invoices" || queryTab === "proposals") {
      setActiveTab(queryTab);
    } else if (!queryTab) {
      setActiveTab("overview");
    }
  }, [queryTab]);

  const switchTab = (tab: "overview" | "projects" | "bookings" | "invoices" | "proposals") => {
    setActiveTab(tab);
    const url = tab === "overview" ? studioPath(tenant.slug, "/account") : studioPath(tenant.slug, `/account?tab=${tab}`);
    router.push(url, { scroll: false });
  };

  const [bookingFilter, setBookingFilter] = useState<"all" | "upcoming" | "past">("all");
  const [invoiceFilter, setInvoiceFilter] = useState<"unpaid" | "paid" | "all">("all");
  const [showVoidInvoices, setShowVoidInvoices] = useState(false);

  const money = (amount: number) => formatMoney(tenant.currency, amount);

  /**
   * A booking's badge. Until the studio confirms it, it says where the deposit stands: still to pay
   * (no slip yet, or cash to bring) or a slip under review. Never "Confirmed" before it is.
   */
  const bookingBadge = (b: BookingRow): { label: string; className: string } => {
    if (b.status === "PENDING") {
      const deposit = invoices.find((i) => i.bookingId === b.id && i.milestoneType === "BOOKING_DEPOSIT");
      const state = deposit ? clientPayState(deposit) : null;
      if (state === "IN_REVIEW") return { label: "Payment under review", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
      return { label: "Awaiting deposit", className: "bg-amber-500/10 text-amber-400 border-amber-500/30" };
    }
    return BOOKING_STATUS_TEXT[b.status] ?? { label: humanize(b.status), className: "bg-zinc-800 text-zinc-400 border-zinc-700" };
  };
  // Dates read the same on the server and in the browser, whatever the viewer's time zone:
  // otherwise the page renders one day on the server, another in the browser.
  const LONG_DAY: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  /** A moment (paid, due) as the studio's calendar date. */
  const formatDate = (d: Date | string) => new Date(d).toLocaleDateString("en-US", { ...LONG_DAY, timeZone: STUDIO_TIME_ZONE });
  /** A shoot or session day, stored as a calendar day. */
  const formatDay = (d: Date | string) => formatSlotDate(d, LONG_DAY, "en-US");

  const formatShortDate = (d: Date | string) => ({
    month: formatSlotDate(d, { month: "short" }, "en-US").toUpperCase(),
    day: new Date(d).getUTCDate(),
    weekday: formatSlotDate(d, { weekday: "short" }, "en-US"),
  });

  // Financial calculations
  // Owed: unpaid, a QR deposit with no slip yet, cash still to bring, or a slip that wasn't accepted.
  const unpaidInvoices = useMemo(() => invoices.filter(isOwed), [invoices]);
  const paidInvoices = useMemo(() => invoices.filter((i) => i.status === "PAID"), [invoices]);
  const voidInvoices = useMemo(
    () => invoices.filter((i) => i.status === "VOID" || i.status === "CANCELLED"),
    [invoices]
  );
  const outstanding = useMemo(() => unpaidInvoices.reduce((sum, i) => sum + i.amount, 0), [unpaidInvoices]);

  /**
   * The payment to bring up first: the one due soonest. "Action required" only when it needs doing
   * now: overdue or due within 3 days, a deposit still to pay (the slot is held only for 24 hours),
   * or a slip the studio didn't accept. A balance due next week just shows its date.
   */
  const nextPayment = useMemo(() => {
    const first = [...unpaidInvoices].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    if (!first) return null;
    const state = clientPayState(first);
    const what = `${milestoneLabel(first.milestoneType).toLowerCase()}${first.project?.title ? ` for ${first.project.title}` : ""}`;
    const soon = new Date(first.dueDate).getTime() - Date.now() < 3 * 86_400_000;
    const urgent = state !== "DUE" || first.status === "OVERDUE" || soon;
    const others = unpaidInvoices.length > 1 ? ` You have ${unpaidInvoices.length} invoices to pay in all.` : "";
    let headline = `${money(first.amount)} to pay`;
    let message = `Your ${what} is due ${formatDate(first.dueDate)}.${others}`;
    if (state === "AWAITING_PAYMENT" && first.paymentMethod === "CASH") {
      headline = `Pay ${money(first.amount)} at the studio`;
      message = `Bring your ${what} to the studio by ${formatDate(first.dueDate)} to keep your booking.${others}`;
    } else if (state === "AWAITING_PAYMENT") {
      headline = `Upload your payment slip`;
      message = `Transfer ${money(first.amount)} for your ${what}, then upload the slip by ${formatDate(first.dueDate)} to keep your booking.${others}`;
    } else if (state === "REJECTED") {
      headline = `Your payment slip wasn't accepted`;
      message = `${first.rejectionReason ? `The studio said: ${first.rejectionReason}. ` : ""}Please upload a new slip for your ${what}.${others}`;
    } else if (first.milestoneType === "FINAL_BALANCE_50" || first.milestoneType === "BOOKING_BALANCE") {
      message += " Paying it unlocks full-resolution downloads once your photos are ready.";
    }
    return { invoice: first, urgent, headline, message, action: clientPayAction(first)?.label ?? null };
  }, [unpaidInvoices]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const getMilestoneLabel = (type: string) => {
    switch (type) {
      case "BOOKING_DEPOSIT":
        return "Deposit (1 of 2)";
      case "BOOKING_BALANCE":
        return "Balance (2 of 2)";
      case "RETAINER_50":
        return "Deposit (1 of 2)";
      case "FINAL_BALANCE_50":
        return "Balance (2 of 2)";
      case "PRINT_FRAME_ORDER":
        return "Framed print order";
      case "CUSTOM":
        return "Invoice";
      default:
        return humanize(type);
    }
  };

  interface InvoiceGroup {
    id: string;
    type: "booking" | "proposal";
    title: string;
    trackingCode?: string;
    totalAmount: number;
    paidAmount: number;
    balanceDue: number;
    percentage: number;
    isFullyPaid: boolean;
    hasReview: boolean;
    invoices: InvoiceRow[];
  }

  // Every bill, unfiltered: the Overview shows the ones that need attention, the Invoices tab filters them.
  const { allGroups, allStandalone } = useMemo(() => {
    const activeList = showVoidInvoices
      ? invoices
      : invoices.filter((i) => i.status !== "VOID" && i.status !== "CANCELLED");

    const bookingMap = new Map<string, InvoiceRow[]>();
    const proposalMap = new Map<string, InvoiceRow[]>();
    const standalone: InvoiceRow[] = [];
    // A print order is billed against the booking's gallery, so it joins that booking's card.
    const bookingByProject = new Map(bookings.flatMap((b) => (b.project ? [[b.project.id, b.id] as const] : [])));
    // Likewise for a proposal: its own invoices name the gallery it was billed for.
    const proposalByProject = new Map(
      invoices.flatMap((i) => (i.proposalId && i.projectId ? [[i.projectId, i.proposalId] as const] : []))
    );

    for (const inv of activeList) {
      const bookingId = invoiceBookingId(inv, bookingByProject);
      const proposalId = bookingId ? null : invoiceProposalId(inv, proposalByProject);
      if (bookingId) {
        const arr = bookingMap.get(bookingId) || [];
        arr.push(inv);
        bookingMap.set(bookingId, arr);
      } else if (proposalId) {
        const arr = proposalMap.get(proposalId) || [];
        arr.push(inv);
        proposalMap.set(proposalId, arr);
      } else {
        standalone.push(inv);
      }
    }

    // The plan's own invoices first (deposit or retainer leading), then extras such as prints, by date.
    const byPlan = (lead: string, plan: ReadonlySet<string>) => (a: InvoiceRow, b: InvoiceRow) => {
      const rank = (i: InvoiceRow) => (i.milestoneType === lead ? 0 : plan.has(i.milestoneType) ? 1 : 2);
      return rank(a) - rank(b) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    };
    const groups: InvoiceGroup[] = [];

    for (const [bookingId, groupInvoices] of bookingMap.entries()) {
      groupInvoices.sort(byPlan("BOOKING_DEPOSIT", BOOKING_MILESTONES));
      const first = groupInvoices[0];
      const matchedBooking = bookings.find((b) => b.id === bookingId) || first?.booking;
      const title =
        matchedBooking?.packageName ||
        (matchedBooking?.category ? categoryName(categories, matchedBooking.category) : null) ||
        "Studio Photoshoot Session";
      const trackingCode = matchedBooking?.trackingCode || first?.booking?.trackingCode;
      const sums = billSums(matchedBooking?.sessionPrice, groupInvoices, BOOKING_MILESTONES);
      groups.push({ id: bookingId, type: "booking", title, trackingCode, ...sums, invoices: groupInvoices });
    }

    for (const [proposalId, groupInvoices] of proposalMap.entries()) {
      groupInvoices.sort(byPlan("RETAINER_50", PROPOSAL_MILESTONES));
      const matchedProposal = proposals.find((p) => p.id === proposalId);
      const title = matchedProposal?.title || "Production Contract";
      const trackingCode = matchedProposal?.proposalNumber;
      const sums = billSums(matchedProposal?.totalPrice, groupInvoices, PROPOSAL_MILESTONES);
      groups.push({ id: proposalId, type: "proposal", title, trackingCode, ...sums, invoices: groupInvoices });
    }

    return { allGroups: groups, allStandalone: standalone };
  }, [invoices, bookings, proposals, showVoidInvoices]);

  const { invoiceGroups, standaloneInvoices } = useMemo(() => {
    const keep = (g: InvoiceGroup) =>
      !(invoiceFilter === "unpaid" && g.balanceDue <= 0 && !g.hasReview) && !(invoiceFilter === "paid" && g.paidAmount <= 0);
    return {
      invoiceGroups: allGroups.filter(keep),
      standaloneInvoices: allStandalone.filter((inv) => {
        if (invoiceFilter === "unpaid") return isOwed(inv) || clientPayState(inv) === "IN_REVIEW";
        if (invoiceFilter === "paid") return inv.status === "PAID";
        return true;
      }),
    };
  }, [allGroups, allStandalone, invoiceFilter]);

  // Overview: one line per bill (a booking with all its invoices, or a lone invoice), what's due first.
  const overviewBills = useMemo(() => {
    const lone = allStandalone
      .filter((inv) => inv.status !== "VOID" && inv.status !== "CANCELLED")
      .map((inv) => ({ id: inv.id, title: getMilestoneLabel(inv.milestoneType), trackingCode: inv.invoiceNumber, ...billSums(0, [inv], new Set()), invoices: [inv] }));
    const urgency = (b: { balanceDue: number; hasReview: boolean }) => (b.balanceDue > 0 ? 0 : b.hasReview ? 1 : 2);
    const latest = (b: { invoices: InvoiceRow[] }) => Math.max(...b.invoices.map((i) => new Date(i.createdAt).getTime()));
    return [...allGroups, ...lone]
      .filter((b) => b.invoices.some((i) => i.status !== "VOID" && i.status !== "CANCELLED"))
      .sort((a, b) => urgency(a) - urgency(b) || latest(b) - latest(a));
  }, [allGroups, allStandalone]);

  return (
    <div className="w-full">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {banner}

        {/* Client Welcome Heading */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800/60">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Welcome back, {client.name.split(" ")[0]}</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Your sessions, photos and invoices, all in one place.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs font-mono text-zinc-400">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-300">Your account</span>
          </div>
        </div>
        {/* Priority 1: High-Visibility Action Notification Banner */}
        {nextPayment ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg shadow-amber-500/5 animate-in fade-in-0 duration-300">
            <div className="flex items-start gap-3.5">
              <div className="size-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                <CreditCard className="size-4.5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white text-sm">
                    {nextPayment.headline}
                  </span>
                  {nextPayment.urgent ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold uppercase">
                      Action Required
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold">
                      Due {formatDate(nextPayment.invoice.dueDate)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-300 max-w-xl">{nextPayment.message}</p>
              </div>
            </div>
            {nextPayment.action ? (
              <Link
                href={studioPath(tenant.slug, `/checkout?invoiceId=${nextPayment.invoice.id}`)}
                className={cn(buttonVariants({ size: "lg" }), "self-start")}
              >
                <span>{nextPayment.action}</span>
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <Link
                href={studioPath(tenant.slug, `/account/invoices/${nextPayment.invoice.id}`)}
                className={cn(buttonVariants({ size: "lg", variant: "secondary" }), "self-start")}
              >
                <span>View invoice</span>
                <ChevronRight className="size-4" />
              </Link>
            )}
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
                  <span>📅 {formatDay(nextShoot.shootDate)}</span>
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
                href={studioPath(tenant.slug, `/vault/${nextShoot.projectId}`)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono transition-colors whitespace-nowrap self-start sm:self-auto"
              >
                <span>Open gallery</span>
                <ChevronRight className="size-3 text-zinc-400" />
              </Link>
            )}
          </div>
        ) : null}

        {/* Top 3 Quick Metric Cards */}
        <div data-tour="client-kpis" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: Upcoming Sessions */}
          <button
            type="button"
            onClick={() => switchTab("bookings")}
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
            onClick={() => switchTab("invoices")}
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
              {outstanding > 0
                ? `${unpaidInvoices.length} ${unpaidInvoices.length === 1 ? "invoice" : "invoices"} to pay`
                : invoices.some((i) => clientPayState(i) === "IN_REVIEW")
                ? "Nothing to pay: a slip is under review"
                : "All invoices settled & clear"}
            </p>
          </button>

          {/* Card 3: Photos & Videos */}
          <button
            type="button"
            onClick={() => switchTab("projects")}
            className="p-4 rounded-xl bg-[#121215] border border-zinc-800/80 hover:border-zinc-700 transition-all text-left group"
          >
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-[11px] font-mono uppercase tracking-wider group-hover:text-zinc-200 transition-colors">
                Photos & videos
              </span>
              <Camera className="size-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-white tabular-nums">
              {totalDeliverablesCount}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {totalDeliverablesCount > 0
                ? `${totalDeliverablesCount} ready to view`
                : "Delivered after shoot day"}
            </p>
          </button>
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
                      Current booking
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">
                      {spotlightProject.projectNumber}
                    </span>
                  </div>
                  {projects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => switchTab("projects")}
                      className="text-xs font-mono text-amber-400 hover:underline flex items-center gap-0.5"
                    >
                      View all {projects.length} galleries <ChevronRight className="size-3" />
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
                        <span>Next shoot: {formatDay(spotlightNextShoot.shootDate)} · {spotlightNextShoot.generalCallTime}</span>
                        <span className="text-zinc-500">· {spotlightNextShoot.locationName}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-400 font-mono">
                        Stage: {STAGES[spotlightStageIndex]?.label || "Planning"}
                      </p>
                    )}
                  </div>
                  <Link
                    href={studioPath(tenant.slug, `/vault/${spotlightProject.id}`)}
                    className={cn(buttonVariants(), "self-start")}
                  >
                    <FolderLock className="size-3.5" />
                    <span>Open gallery</span>
                    <ChevronRight className="size-3.5" />
                  </Link>
                </div>

                {/* Compact Stage Timeline */}
                <div className="bg-[#18181c] p-3.5 rounded-xl border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-zinc-400 uppercase tracking-wider">Progress</span>
                    <span className="text-amber-400 font-semibold">
                      Step {spotlightStageIndex + 1} of 5: {STAGES[spotlightStageIndex]?.label}
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
                          {/* The current stage is named above; on a phone the strip shows bars only. */}
                          <span className="sr-only sm:not-sr-only">{s.label}</span>
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
                      onClick={() => switchTab("bookings")}
                      className="text-[11px] font-mono text-amber-400 hover:underline flex items-center gap-0.5"
                    >
                      All ({bookings.length}) <ChevronRight className="size-3" />
                    </button>
                  </div>

                  {bookings.length === 0 ? (
                    <div className="py-4 text-center space-y-2">
                      <p className="text-xs text-zinc-500">No sessions booked right now.</p>
                      <Link
                        href={studioPath(tenant.slug, "/book")}
                        className="inline-flex items-center gap-1 text-xs font-mono text-amber-400 hover:underline"
                      >
                        + Book a session
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(upcomingBookings.length > 0 ? upcomingBookings : bookings).slice(0, 2).map((b) => {
                        const dateInfo = b.slot ? formatShortDate(b.slot.date) : null;
                        return (
                          <Link
                            key={b.id}
                            href={studioPath(tenant.slug, `/account/bookings/${b.id}`)}
                            className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex items-center justify-between text-xs font-mono hover:border-zinc-700 hover:bg-zinc-900 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              {dateInfo && (
                                <div className="size-10 rounded-lg bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-center text-center flex-shrink-0 group-hover:border-amber-500/40 transition-colors">
                                  <span className="text-[8px] uppercase text-amber-400 font-bold leading-none">
                                    {dateInfo.month}
                                  </span>
                                  <span className="text-sm font-black text-white leading-tight">
                                    {dateInfo.day}
                                  </span>
                                </div>
                              )}
                              <div className="space-y-0.5">
                                <div className="font-semibold text-white group-hover:text-amber-400 transition-colors flex items-center gap-1.5">
                                  <span>{categoryName(categories, b.category)}</span>
                                  <ChevronRight className="size-3 text-zinc-500 group-hover:text-amber-400 transition-transform group-hover:translate-x-0.5" />
                                </div>
                                <div className="text-[11px] text-zinc-400">
                                  {b.slot ? `${b.slot.startTime} – ${b.slot.endTime}` : "Time confirmed"}
                                </div>
                              </div>
                            </div>
                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap", bookingBadge(b).className)}>
                              {bookingBadge(b).label}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => switchTab("bookings")}
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
                      onClick={() => switchTab("invoices")}
                      className="text-[11px] font-mono text-amber-400 hover:underline flex items-center gap-0.5"
                    >
                      All ({invoices.length}) <ChevronRight className="size-3" />
                    </button>
                  </div>

                  {overviewBills.length === 0 ? (
                    <p className="py-4 text-center text-xs text-zinc-500">No bills yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {overviewBills.slice(0, 3).map((bill) => {
                        const payable = bill.invoices.find((i) => clientPayAction(i));
                        const lone = bill.invoices.length === 1 ? bill.invoices[0] : null;
                        return (
                          <div
                            key={bill.id}
                            className={cn(
                              "p-3 rounded-xl border text-xs font-mono space-y-2",
                              bill.balanceDue > 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-zinc-900/70 border-zinc-800/80"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-bold text-white truncate">{bill.title}</div>
                                <div className="text-[11px] text-zinc-400">
                                  {bill.trackingCode ? `${bill.trackingCode} · ` : ""}
                                  {bill.invoices.length} {bill.invoices.length === 1 ? "invoice" : "invoices"}
                                </div>
                              </div>
                              {bill.isFullyPaid ? (
                                <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  Settled
                                </span>
                              ) : bill.balanceDue > 0 ? (
                                <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  {money(bill.balanceDue)} due
                                </span>
                              ) : bill.hasReview ? (
                                <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  Under review
                                </span>
                              ) : null}
                            </div>
                            <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className={cn("h-full", bill.isFullyPaid ? "bg-emerald-500" : "bg-amber-400")}
                                style={{ width: `${Math.min(100, Math.max(0, bill.percentage))}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="text-zinc-400">
                                {money(bill.paidAmount)} of {money(bill.totalAmount)} paid
                              </span>
                              {payable ? (
                                <Link
                                  href={studioPath(tenant.slug, `/checkout?invoiceId=${payable.id}`)}
                                  className="shrink-0 whitespace-nowrap font-bold text-amber-300 hover:underline uppercase"
                                >
                                  {clientPayAction(payable)?.label} →
                                </Link>
                              ) : lone?.status === "PAID" ? (
                                <Link href={studioPath(tenant.slug, `/account/invoices/${lone.id}`)} className="shrink-0 whitespace-nowrap text-zinc-300 hover:text-white hover:underline">
                                  Receipt →
                                </Link>
                              ) : (
                                <button type="button" onClick={() => switchTab("invoices")} className="shrink-0 whitespace-nowrap text-zinc-300 hover:text-white hover:underline">
                                  Details →
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => switchTab("invoices")}
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
                  Your galleries ({projects.length})
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Follow each shoot from planning to your finished photos.
                </p>
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#121215] border border-zinc-800 text-center space-y-2">
                <Camera className="size-8 text-zinc-600 mx-auto" />
                <h3 className="text-sm font-bold text-zinc-300">No active galleries yet</h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  When you book a session, its gallery appears here.
                </p>
                <Link
                  href={studioPath(tenant.slug, "/book")}
                  className={cn(buttonVariants({ size: "sm" }), "mt-2")}
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
                              Booking {p.booking.trackingCode} · {categoryName(categories, p.booking.category)}
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
                            {STAGES[stageIndex]?.label ?? humanize(p.status)}
                          </span>
                        </div>
                      </div>

                      {/* 5-Stage Interactive Progress Bar */}
                      <div className="bg-[#18181c] p-4 rounded-xl border border-zinc-800/80 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-zinc-400 text-[11px] uppercase tracking-wider">
                            Progress
                          </span>
                          <span className="text-amber-400 font-semibold">
                            Step {stageIndex + 1} of 5: {STAGES[stageIndex]?.label || "Planning"}
                          </span>
                        </div>

                        <ol className="grid grid-cols-5 gap-1.5 sm:gap-2" aria-label="Project stage progress">
                          {STAGES.map((s, idx) => {
                            const isCompleted = idx < stageIndex;
                            const isCurrent = idx === stageIndex;
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
                                  {/* The current stage is named above; on a phone only the icons show. */}
                                  <span className="truncate sr-only sm:not-sr-only">{s.label}</span>
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
                                  Upcoming Shoot: {formatDay(nextShootDay.shootDate)} · {nextShootDay.generalCallTime}
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
                              <span>Your photos will appear here once the studio uploads them.</span>
                            </div>
                          )}

                          {items.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs">
                              {p.isFinalBalancePaid || tenant.releaseFilesBeforePayment ? (
                                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                                  <LockOpen className="size-3.5" />
                                  Full-resolution photos ready to download{p.isFinalBalancePaid ? "" : " (balance still due)"}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-amber-400/90 font-medium">
                                  <Lock className="size-3.5" />
                                  Watermarked previews (full resolution unlocks when the balance is paid)
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex-shrink-0 flex items-center gap-2">
                          <Link
                            href={studioPath(tenant.slug, `/vault/${p.id}`)}
                            className={buttonVariants({ size: "lg" })}
                          >
                            <FolderLock className="size-4" />
                            <span>Open gallery</span>
                            <ChevronRight className="size-3.5" />
                          </Link>
                        </div>
                      </div>

                      {p.framedPrints && (p.framedPrints.lines.length > 0 || p.framedPrints.orders.length > 0) && (
                        <FramedPrintsSection
                          compact
                          tenantId={tenant.id}
                          tenantSlug={tenant.slug}
                          currency={currencySymbol(tenant.currency)}
                          projectId={p.id}
                          lines={p.framedPrints.lines}
                          unlocked={p.framedPrints.unlocked}
                          hasPhotos={p.framedPrints.hasPhotos}
                          orders={p.framedPrints.orders}
                        />
                      )}
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
                  Your bookings ({bookings.length})
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Your sessions, with their times and places.
                </p>
              </div>

              {/* Sub-filter pills */}
              <div className={cn(chipListClass, "self-start sm:self-auto")}>
                <button
                  type="button"
                  onClick={() => setBookingFilter("all")}
                  className={chipClass(bookingFilter === "all")}
                >
                  All ({bookings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBookingFilter("upcoming")}
                  className={chipClass(bookingFilter === "upcoming")}
                >
                  Upcoming ({upcomingBookings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBookingFilter("past")}
                  className={chipClass(bookingFilter === "past")}
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
                  const statusInfo = bookingBadge(b);
                  const dateInfo = b.slot ? formatShortDate(b.slot.date) : null;

                  return (
                    <div
                      key={b.id}
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-zinc-900/20 -mx-2 px-2 rounded-xl transition-colors"
                    >
                      {/* Left: Date badge + category */}
                      <div className="flex items-start gap-3.5">
                        {dateInfo ? (
                          <Link
                            href={studioPath(tenant.slug, `/account/bookings/${b.id}`)}
                            className="size-12 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center text-center flex-shrink-0 group-hover:border-amber-500/40 hover:scale-105 transition-all"
                            title="View booking details"
                          >
                            <span className="text-[9px] font-mono uppercase text-amber-400 font-bold leading-none">
                              {dateInfo.month}
                            </span>
                            <span className="text-base font-black text-white leading-tight font-mono">
                              {dateInfo.day}
                            </span>
                          </Link>
                        ) : (
                          <Link
                            href={studioPath(tenant.slug, `/account/bookings/${b.id}`)}
                            className="size-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 flex-shrink-0 hover:border-zinc-700 hover:text-white transition-colors"
                            title="View booking details"
                          >
                            <CalendarClock className="size-5" />
                          </Link>
                        )}

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={studioPath(tenant.slug, `/account/bookings/${b.id}`)}
                              className="font-bold text-white text-sm hover:text-amber-400 transition-colors inline-flex items-center gap-1 group/title"
                            >
                              <span>{categoryName(categories, b.category)}</span>
                              <ChevronRight className="size-3 text-zinc-500 group-hover/title:text-amber-400 transition-transform group-hover/title:translate-x-0.5" />
                            </Link>
                            <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
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

                          <div className="flex items-center gap-3 pt-0.5">
                            <Link
                              href={studioPath(tenant.slug, `/account/bookings/${b.id}`)}
                              className="text-[11px] text-amber-400 hover:underline inline-flex items-center gap-1 font-mono"
                            >
                              <Eye className="size-3" />
                              <span>View details</span>
                            </Link>

                            {b.project && (
                              <Link
                                href={studioPath(tenant.slug, `/vault/${b.project.id}`)}
                                className="text-[11px] text-zinc-400 hover:text-white inline-flex items-center gap-1 font-mono"
                              >
                                <span>Open gallery</span>
                                <ChevronRight className="size-3" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Status badge & action CTAs */}
                      <div className="flex items-center gap-2.5 self-end sm:self-center flex-wrap">
                        <Link
                          href={studioPath(tenant.slug, `/account/bookings/${b.id}`)}
                          className={cn(
                            buttonVariants({ variant: "secondary", size: "sm" }),
                            "h-8 text-xs font-mono border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 hover:text-white flex items-center gap-1.5"
                          )}
                        >
                          <Eye className="size-3.5 text-amber-400" />
                          <span>View Details</span>
                        </Link>

                        {b.status === "DELIVERED" && b.deliveryUrl && (
                          <a
                            href={b.deliveryUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonVariants({ size: "sm" })}
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
                  Deposits, balances and receipts for your sessions.
                </p>
              </div>

              {/* Filter pills */}
              <div className={cn(chipListClass, "self-start sm:self-auto")}>
                <button
                  type="button"
                  onClick={() => setInvoiceFilter("all")}
                  className={chipClass(invoiceFilter === "all")}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceFilter("unpaid")}
                  className={chipClass(invoiceFilter === "unpaid")}
                >
                  Unpaid ({unpaidInvoices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceFilter("paid")}
                  className={chipClass(invoiceFilter === "paid")}
                >
                  Paid ({paidInvoices.length})
                </button>
              </div>
            </div>

            {invoiceGroups.length === 0 && standaloneInvoices.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                {invoiceFilter === "unpaid" ? "Great news! You have zero unpaid invoices or balances." : "No invoices recorded."}
              </p>
            ) : (
              <div className="space-y-4">
                {/* 1. Grouped Booking & Production Invoices */}
                {invoiceGroups.map((group) => (
                  <div
                    key={group.id}
                    className="rounded-2xl border border-zinc-800 bg-[#0d0d10] overflow-hidden shadow-sm transition-all hover:border-zinc-700/80"
                  >
                    {/* Booking/Contract Billing Header */}
                    <div className="p-4 sm:p-5 border-b border-zinc-800/80 bg-zinc-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-sm sm:text-base tracking-tight flex items-center gap-2">
                            <CalendarCheck className="size-4 text-amber-400" />
                            {group.title}
                          </span>
                          {group.trackingCode && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                              {group.trackingCode}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 font-mono">
                          Total: <strong className="text-white">{money(group.totalAmount)}</strong>
                          {group.paidAmount > 0 && (
                            <span> · <span className="text-emerald-400">{money(group.paidAmount)} paid</span></span>
                          )}
                          {group.balanceDue > 0 && (
                            <span> · <span className="text-amber-400">{money(group.balanceDue)} balance due</span></span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {group.isFullyPaid ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                            <CheckCircle2 className="size-3.5" /> All settled
                          </span>
                        ) : group.hasReview ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Under review
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            {money(group.balanceDue)} due
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-1 w-full bg-zinc-800/80">
                      <div
                        className={cn(
                          "h-full transition-all duration-500",
                          group.isFullyPaid ? "bg-emerald-500" : "bg-amber-400"
                        )}
                        style={{ width: `${Math.min(100, Math.max(0, group.percentage))}%` }}
                      />
                    </div>

                    {/* Milestone Invoices Inside Card */}
                    <div className="divide-y divide-zinc-800/60 p-2 sm:p-3">
                      {group.invoices.map((inv) => {
                        const isUnpaid = isOwed(inv);
                        const isPaid = inv.status === "PAID";
                        const isReview = clientPayState(inv) === "IN_REVIEW";
                        const payAction = clientPayAction(inv);

                        return (
                          <div
                            key={inv.id}
                            className={cn(
                              "p-3 sm:p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors",
                              isUnpaid
                                ? "bg-amber-500/5 border border-amber-500/25 my-1"
                                : "hover:bg-zinc-900/40 border border-transparent"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 shrink-0">
                                {isPaid ? (
                                  <div className="size-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                                    <Check className="size-3.5" />
                                  </div>
                                ) : isReview ? (
                                  <div className="size-6 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center">
                                    <Eye className="size-3.5" />
                                  </div>
                                ) : (
                                  <div className="size-6 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                                    <Clock className="size-3.5" />
                                  </div>
                                )}
                              </div>

                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-white">
                                    {getMilestoneLabel(inv.milestoneType)}
                                  </span>
                                  <Link
                                    href={studioPath(tenant.slug, `/account/invoices/${inv.id}`)}
                                    className="font-mono text-[11px] text-zinc-400 hover:text-amber-400 transition-colors underline decoration-zinc-700 underline-offset-2 flex items-center gap-0.5"
                                  >
                                    <span>{inv.invoiceNumber}</span>
                                    <ArrowUpRight className="size-2.5 text-zinc-500" />
                                  </Link>
                                </div>

                                <div className="text-[11px] text-zinc-400 font-mono flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                  <span>
                                    {isPaid && inv.paidAt
                                      ? `Paid ${formatDate(inv.paidAt)}`
                                      : `Due ${formatDate(inv.dueDate)}`}
                                  </span>
                                  {inv.paymentMethod && isPaid && (
                                    <span className="text-zinc-500">· {paymentMethodLabel(inv.paymentMethod)}</span>
                                  )}
                                </div>

                                {inv.status === "REJECTED" && (
                                  <p className="text-[11px] text-rose-400 font-mono mt-1">
                                    Payment proof not accepted{inv.rejectionReason ? `: ${inv.rejectionReason}` : ""}. Please upload a new slip within 24 hours.
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                              <span className="font-mono font-bold text-white text-sm tabular-nums">
                                {money(inv.amount)}
                              </span>

                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-mono font-bold border whitespace-nowrap",
                                  isPaid
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : isUnpaid
                                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                    : isReview
                                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                    : "bg-zinc-800 text-zinc-400 border-zinc-700"
                                )}
                              >
                                {clientPayLabel(inv)}
                              </span>

                              {isPaid && (
                                <Link
                                  href={studioPath(tenant.slug, `/account/invoices/${inv.id}`)}
                                  className="px-2.5 py-1 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-xs font-mono transition-colors"
                                >
                                  Receipt
                                </Link>
                              )}

                              {payAction && (
                                <Link
                                  href={studioPath(tenant.slug, `/checkout?invoiceId=${inv.id}`)}
                                  className={buttonVariants({ size: "sm" })}
                                >
                                  {payAction.label}
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* 2. Standalone & Direct Orders (Prints, Frames, Custom) */}
                {standaloneInvoices.length > 0 && (
                  <div className="space-y-3 pt-2">
                    {invoiceGroups.length > 0 && (
                      <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-400 pt-2">
                        Other invoices ({standaloneInvoices.length})
                      </h3>
                    )}
                    <div className="divide-y divide-zinc-800/60 rounded-2xl border border-zinc-800 bg-[#0d0d10] p-2 sm:p-3">
                      {standaloneInvoices.map((inv) => {
                        const isUnpaid = isOwed(inv);
                        const isPaid = inv.status === "PAID";
                        const isReview = clientPayState(inv) === "IN_REVIEW";
                        const payAction = clientPayAction(inv);

                        return (
                          <div
                            key={inv.id}
                            className={cn(
                              "p-3 sm:p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors",
                              isUnpaid
                                ? "bg-amber-500/5 border border-amber-500/25 my-1"
                                : "hover:bg-zinc-900/40 border border-transparent"
                            )}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  href={studioPath(tenant.slug, `/account/invoices/${inv.id}`)}
                                  className="font-mono text-xs font-bold text-white hover:text-amber-400 transition-colors underline decoration-zinc-700 underline-offset-2 flex items-center gap-1"
                                >
                                  <span>{inv.invoiceNumber}</span>
                                  <ArrowUpRight className="size-3 text-zinc-500" />
                                </Link>
                                <span className="text-xs text-zinc-300 font-medium">
                                  · {getMilestoneLabel(inv.milestoneType)}
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
                                <p className="text-[11px] text-rose-400 font-mono mt-1">
                                  Payment proof not accepted{inv.rejectionReason ? `: ${inv.rejectionReason}` : ""}. Please upload a new slip within 24 hours.
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                              <span className="font-mono font-bold text-white text-sm tabular-nums">
                                {money(inv.amount)}
                              </span>

                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-mono font-bold border whitespace-nowrap",
                                  isPaid
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : isUnpaid
                                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                    : isReview
                                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                    : "bg-zinc-800 text-zinc-400 border-zinc-700"
                                )}
                              >
                                {clientPayLabel(inv)}
                              </span>

                              {isPaid && (
                                <Link
                                  href={studioPath(tenant.slug, `/account/invoices/${inv.id}`)}
                                  className="px-2.5 py-1 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-xs font-mono transition-colors"
                                >
                                  Receipt
                                </Link>
                              )}

                              {payAction && (
                                <Link
                                  href={studioPath(tenant.slug, `/checkout?invoiceId=${inv.id}`)}
                                  className={buttonVariants({ size: "sm" })}
                                >
                                  {payAction.label}
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
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
                Proposals ({proposals.length})
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Quotes from the studio to read and sign.
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
                      {PROPOSAL_STATUS_TEXT[p.status] ?? humanize(p.status)}
                    </span>
                    <Link
                      href={studioPath(tenant.slug, `/proposals/${p.id}`)}
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
            Need to change something? Contact the studio.
          </p>
        </footer>
      </main>
    </div>
  );
}

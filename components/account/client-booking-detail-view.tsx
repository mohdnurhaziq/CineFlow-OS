"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Eye,
  Printer,
  Copy,
  Check,
  ExternalLink,
  FileText,
  Sparkles,
  Package as PackageIcon,
  Camera,
  Layers,
  ShieldCheck,
  Receipt,
  ChevronRight,
  Image as ImageIcon,
  Phone,
  Mail,
  User,
  CalendarCheck,
  MessageSquare,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatSlotDate, formatStudioDate, STUDIO_TIME_ZONE } from "@/lib/slot-time";
import { categoryName } from "@/lib/bookings/category-name";
import { studioPath } from "@/lib/domain-name";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface ClientBookingDetailProps {
  tenant: {
    id: string;
    name: string;
    slug: string;
    brandColor?: string | null;
    currency: string;
    discipline?: string;
    tagline?: string | null;
    bio?: string | null;
    logoUrl?: string | null;
    bankDetails?: string | null;
  };
  booking: {
    id: string;
    trackingCode: string;
    category: string;
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    discipline: string;
    serviceTier: string;
    targetDate: string | null;
    creativeBrief: string | null;
    status: string;
    cancelledAt: Date | null;
    cancelReason: string | null;
    completedAt: Date | null;
    deliveredAt: Date | null;
    deliveryUrl: string | null;
    depositPaid: boolean;
    depositAmount: number;
    packageName: string | null;
    sessionPrice: number | null;
    paymentMethod: string | null;
    createdAt: Date;
    slot: {
      id: string;
      date: Date;
      startTime: string;
      endTime: string;
      status: string;
      campaignTitle: string | null;
      price: number;
      depositRequired: number;
    } | null;
    package: {
      id: string;
      name: string;
      category: string;
      discipline: string;
      price: number;
      depositPrice: number;
      description: string;
      deliverables: string;
      turnaround: string;
    } | null;
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      milestoneType: string;
      amount: number;
      status: string;
      dueDate: Date;
      paidAt: Date | null;
      paymentMethod: string | null;
      paymentProofUrl: string | null;
      verifiedBy: string | null;
      description?: string | null;
    }>;
    includedPrints: Array<{
      id: string;
      sizeName: string;
      widthInches: number;
      heightInches: number;
      frameName: string;
      quantity: number;
      claimed: number;
      remaining: number;
      note?: string | null;
    }>;
    assignments: Array<{
      id: string;
      user: {
        id: string;
        name: string;
        email: string;
        role: string;
        teamRole?: { name: string } | null;
      };
    }>;
    project: {
      id: string;
      projectNumber: string;
      title: string;
      status: string;
      isFinalBalancePaid: boolean;
      deliverables: Array<{
        id: string;
        title: string;
        discipline: string;
        status: string;
        items: Array<{
          id: string;
          title: string;
          itemType: string;
          previewUrl: string;
          thumbnailUrl: string | null;
          isClientFav: boolean;
        }>;
      }>;
      callSheets: Array<{
        id: string;
        title: string;
        shootDate: Date;
        generalCallTime: string;
        locationName: string;
        locationAddress: string;
        locationPinUrl?: string | null;
        parkingNotes?: string | null;
        notes?: string | null;
      }>;
    } | null;
  };
  categories: Array<{ slug: string; name: string }>;
  studioOwner?: { name: string; email: string; phone?: string | null } | null;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string; icon: React.ComponentType<{ className?: string }>; desc: string }
> = {
  CONFIRMED: {
    label: "Confirmed",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: CheckCircle2,
    desc: "Your booking is locked in and scheduled on the studio calendar.",
  },
  PENDING: {
    label: "Awaiting Verification",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: Clock,
    desc: "Your booking request is pending deposit payment or verification by studio staff.",
  },
  COMPLETED: {
    label: "Session Completed",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: Camera,
    desc: "Your photo shoot has wrapped! Your files are currently in post-production & editing.",
  },
  DELIVERED: {
    label: "Delivered & Ready",
    badgeClass: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    icon: Sparkles,
    desc: "Your session files and proofs are ready in your private client photo vault.",
  },
  CANCELLED: {
    label: "Cancelled",
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    icon: AlertCircle,
    desc: "This booking has been cancelled.",
  },
  NO_SHOW: {
    label: "Missed",
    badgeClass: "bg-zinc-800 text-zinc-400 border-zinc-700",
    icon: AlertCircle,
    desc: "The session was marked as missed.",
  },
};

function humanize(val: string) {
  return val
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPaymentMethodLabel(method?: string | null) {
  switch (method) {
    case "CARD":
      return "Card / Online Banking";
    case "QR_CODE":
      return "DuitNow QR";
    case "CASH":
      return "Cash Counter";
    case "BANK_TRANSFER":
      return "Direct Bank Transfer";
    default:
      return method ? method.replace(/_/g, " ") : "Not selected";
  }
}

function getInvoiceStatusBadge(status: string) {
  switch (status) {
    case "PAID":
      return { label: "Paid", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    case "PENDING":
      return { label: "Unpaid", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    case "PENDING_VERIFICATION":
      return { label: "Under Review", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
    case "OVERDUE":
      return { label: "Overdue", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
    case "REJECTED":
      return { label: "Rejected", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
    default:
      return { label: status, className: "bg-zinc-800 text-zinc-400 border-zinc-700" };
  }
}

export function ClientBookingDetailView({
  tenant,
  booking,
  categories,
  studioOwner,
}: ClientBookingDetailProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const accentColor = tenant.brandColor || "#f59e0b";

  const money = (amount: number) => formatMoney(tenant.currency, amount);

  const statusInfo =
    STATUS_CONFIG[booking.status] ?? {
      label: humanize(booking.status),
      badgeClass: "bg-zinc-800 text-zinc-400 border-zinc-700",
      icon: Clock,
      desc: "Booking status: " + booking.status,
    };
  const StatusIcon = statusInfo.icon;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(booking.trackingCode);
      setCopiedCode(true);
      toast.success("Booking tracking code copied!");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Pricing calculations
  const sessionPrice = booking.sessionPrice ?? booking.package?.price ?? 0;
  const depositAmount = booking.depositAmount;
  const balanceRemaining = Math.max(0, sessionPrice - depositAmount);

  // Delivered deliverables count
  const allDeliverableItems =
    booking.project?.deliverables.flatMap((d) => d.items) ?? [];
  const photosCount = allDeliverableItems.filter((i) => i.itemType === "PHOTO").length;

  // Active call sheet location
  const latestCallSheet = booking.project?.callSheets?.[0];

  // Lifecycle steps for the tracker
  const isDepositPaid =
    booking.depositPaid ||
    booking.invoices.some((i) => i.milestoneType === "BOOKING_DEPOSIT" && i.status === "PAID");

  const isConfirmed =
    booking.status === "CONFIRMED" ||
    booking.status === "COMPLETED" ||
    booking.status === "DELIVERED";

  const isCompleted =
    booking.status === "COMPLETED" || booking.status === "DELIVERED";

  const isDelivered = booking.status === "DELIVERED";

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* ──────────────────────────────────────────────────────────── */}
      {/* 1. TOP NAVIGATION & ACTIONS (Hidden in Print)                */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <Link
          href={studioPath(tenant.slug, "/account?tab=bookings")}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors group"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to all bookings</span>
        </Link>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={handleCopyCode}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "h-8 text-xs font-mono border-zinc-800 bg-[#121215] text-zinc-300 hover:text-white hover:bg-zinc-800/80"
            )}
          >
            {copiedCode ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            <span>{copiedCode ? "Copied" : "Copy Code"}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "h-8 text-xs font-mono border-zinc-800 bg-[#121215] text-zinc-300 hover:text-white hover:bg-zinc-800/80"
            )}
          >
            <Printer className="size-3.5" />
            <span>Print Confirmation</span>
          </button>

          {booking.project && (
            <Link
              href={studioPath(tenant.slug, `/vault/${booking.project.id}`)}
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-8 text-xs font-mono font-bold shadow-sm"
              )}
              style={{ backgroundColor: accentColor, color: "#000" }}
            >
              <Eye className="size-3.5" />
              <span>Open Photo Vault</span>
            </Link>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 2. MAIN BOOKING HEADER HERO                                  */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[#121215] border border-zinc-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: `${accentColor}20`,
                  color: accentColor,
                  border: `1px solid ${accentColor}40`,
                }}
              >
                {categoryName(categories, booking.category)}
              </span>

              <span className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
                #{booking.trackingCode}
              </span>

              {booking.packageName && (
                <span className="text-xs font-mono text-zinc-400 border border-zinc-800/60 px-2 py-0.5 rounded bg-zinc-900/40">
                  {booking.packageName}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {booking.packageName
                ? `${booking.packageName} Session`
                : `${categoryName(categories, booking.category)} Booking`}
            </h1>

            <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
              {statusInfo.desc}
            </p>
          </div>

          {/* Right Status Badge */}
          <div className="flex flex-col items-start md:items-end gap-1.5 self-start md:self-auto flex-shrink-0">
            <div
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-mono font-bold uppercase tracking-wide",
                statusInfo.badgeClass
              )}
            >
              <StatusIcon className="size-4" />
              <span>{statusInfo.label}</span>
            </div>

            <span className="text-[11px] font-mono text-zinc-400">
              Booked on {formatStudioDate(booking.createdAt)}
            </span>
          </div>
        </div>

        {/* Lifecycle Stage Indicator */}
        <div className="pt-2 border-t border-zinc-800/80">
          <div className="text-[11px] font-mono uppercase text-zinc-400 tracking-wider mb-3">
            Booking & Production Progress
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {/* Step 1: Booking Placed */}
            <div
              className={cn(
                "p-3 rounded-xl border flex flex-col gap-1 transition-all",
                "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
              )}
            >
              <div className="flex items-center justify-between text-xs font-bold font-mono">
                <span>1. Placed</span>
                <CheckCircle2 className="size-3.5 text-emerald-400" />
              </div>
              <span className="text-[11px] text-zinc-400 leading-tight">
                {formatStudioDate(booking.createdAt)}
              </span>
            </div>

            {/* Step 2: Deposit Confirmed */}
            <div
              className={cn(
                "p-3 rounded-xl border flex flex-col gap-1 transition-all",
                isDepositPaid || isConfirmed
                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400"
              )}
            >
              <div className="flex items-center justify-between text-xs font-bold font-mono">
                <span>2. Deposit</span>
                {isDepositPaid || isConfirmed ? (
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                ) : (
                  <Clock className="size-3.5 text-zinc-400" />
                )}
              </div>
              <span className="text-[11px] text-zinc-400 leading-tight">
                {isDepositPaid ? `Paid (${money(depositAmount)})` : "Awaiting Deposit"}
              </span>
            </div>

            {/* Step 3: Photo Session */}
            <div
              className={cn(
                "p-3 rounded-xl border flex flex-col gap-1 transition-all",
                isCompleted
                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                  : isConfirmed
                  ? "bg-amber-500/5 border-amber-500/30 text-amber-400"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400"
              )}
            >
              <div className="flex items-center justify-between text-xs font-bold font-mono">
                <span>3. Session</span>
                {isCompleted ? (
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                ) : (
                  <Camera className="size-3.5" />
                )}
              </div>
              <span className="text-[11px] text-zinc-400 leading-tight">
                {booking.slot ? booking.slot.startTime : "Scheduled"}
              </span>
            </div>

            {/* Step 4: Photo Vault Delivery */}
            <div
              className={cn(
                "p-3 rounded-xl border flex flex-col gap-1 transition-all",
                isDelivered
                  ? "bg-purple-500/10 border-purple-500/30 text-purple-400"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400"
              )}
            >
              <div className="flex items-center justify-between text-xs font-bold font-mono">
                <span>4. Delivery</span>
                {isDelivered ? (
                  <Sparkles className="size-3.5 text-purple-400" />
                ) : (
                  <Layers className="size-3.5 text-zinc-400" />
                )}
              </div>
              <span className="text-[11px] text-zinc-400 leading-tight">
                {isDelivered ? "Vault Ready" : "Post-Production"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 3. TWO COLUMN CONTENT GRID                                   */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ======================================================== */}
        {/* LEFT COLUMN: SESSION & PRODUCTION DETAILS (2 COLS)       */}
        {/* ======================================================== */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card: Appointment Schedule & Time */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-zinc-800/80 pb-3">
              <CalendarCheck className="size-4 text-amber-400" />
              <h2>Appointment & Schedule</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date */}
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-3">
                <div className="size-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-amber-400 flex-shrink-0">
                  <Calendar className="size-5" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[11px] font-mono uppercase text-zinc-400 block">
                    Session Date
                  </span>
                  <p className="text-sm font-bold text-white">
                    {booking.slot
                      ? formatSlotDate(
                          booking.slot.date,
                          { weekday: "long", year: "numeric", month: "long", day: "numeric" }
                        )
                      : booking.targetDate || "Date to be confirmed"}
                  </p>
                </div>
              </div>

              {/* Time */}
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-3">
                <div className="size-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-amber-400 flex-shrink-0">
                  <Clock className="size-5" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[11px] font-mono uppercase text-zinc-400 block">
                    Session Time
                  </span>
                  <p className="text-sm font-bold text-white">
                    {booking.slot
                      ? `${booking.slot.startTime} – ${booking.slot.endTime}`
                      : "Time confirmed with studio"}
                  </p>
                  <span className="text-[11px] font-mono text-zinc-400">
                    Studio timezone ({STUDIO_TIME_ZONE})
                  </span>
                </div>
              </div>
            </div>

            {/* Location & Studio Studio Details */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-3">
              <div className="size-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-amber-400 flex-shrink-0">
                <MapPin className="size-5" />
              </div>
              <div className="space-y-1 flex-1">
                <span className="text-[11px] font-mono uppercase text-zinc-400 block">
                  Location & Studio
                </span>
                <p className="text-sm font-bold text-white">
                  {latestCallSheet?.locationName || tenant.name}
                </p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {latestCallSheet?.locationAddress ||
                    tenant.bio ||
                    "Studio headquarters & private creative bay"}
                </p>

                {latestCallSheet?.parkingNotes && (
                  <p className="text-[11px] font-mono text-zinc-400 pt-1">
                    🚗 Parking: {latestCallSheet.parkingNotes}
                  </p>
                )}

                {latestCallSheet?.locationPinUrl && (
                  <a
                    href={latestCallSheet.locationPinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-mono text-amber-400 hover:underline pt-1"
                  >
                    <span>Open in Google Maps</span>
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Assigned Team / Photographer */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-3">
              <div className="size-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-amber-400 flex-shrink-0">
                <User className="size-5" />
              </div>
              <div className="space-y-1 flex-1">
                <span className="text-[11px] font-mono uppercase text-zinc-400 block">
                  Studio Lead & Assigned Team
                </span>
                {booking.assignments.length > 0 ? (
                  <div className="space-y-1">
                    {booking.assignments.map((a) => (
                      <div key={a.id} className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{a.user.name}</span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">
                          {a.user.teamRole?.name || (a.user.role === "STUDIO_OWNER" ? "Studio Owner" : "Photographer")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-medium text-white">
                    {studioOwner?.name || tenant.name}
                    <span className="text-xs text-zinc-400 font-normal block">
                      Lead Studio Team
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Card: Service Package & Inclusions */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-zinc-800/80 pb-3">
              <PackageIcon className="size-4 text-amber-400" />
              <h2>Package & Deliverables</h2>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {booking.package?.name || booking.packageName || "Custom Session"}
                  </h3>
                  <span className="text-xs font-mono text-zinc-400">
                    Discipline: {booking.discipline} · Tier: {booking.serviceTier}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-white font-mono">
                    {money(sessionPrice)}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-400 block">
                    Total Session Price
                  </span>
                </div>
              </div>

              {booking.package?.description && (
                <div className="text-xs text-zinc-300 bg-zinc-900/40 p-3.5 rounded-xl border border-zinc-800/60 leading-relaxed">
                  <strong className="text-white block mb-1">Package Scope:</strong>
                  {booking.package.description}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60 space-y-1">
                  <span className="text-[11px] font-mono uppercase text-zinc-400 block">
                    Deliverables
                  </span>
                  <p className="font-semibold text-zinc-200">
                    {booking.package?.deliverables || "High-resolution digital files & proofing vault"}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60 space-y-1">
                  <span className="text-[11px] font-mono uppercase text-zinc-400 block">
                    Turnaround Time
                  </span>
                  <p className="font-semibold text-zinc-200">
                    {booking.package?.turnaround || "5–7 business days"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Included Prints Entitlements (if any) */}
          {booking.includedPrints.length > 0 && (
            <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
              <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-zinc-800/80 pb-3">
                <Layers className="size-4 text-amber-400" />
                <h2>Included Framed Prints & Keepsakes</h2>
              </div>

              <div className="space-y-2.5">
                {booking.includedPrints.map((print) => (
                  <div
                    key={print.id}
                    className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-bold text-white">
                        {print.quantity}x {print.sizeName} ({print.widthInches}&quot; × {print.heightInches}&quot;)
                      </h4>
                      <p className="text-xs text-zinc-400">
                        Frame: <strong className="text-zinc-200">{print.frameName}</strong>
                      </p>
                      {print.note && (
                        <p className="text-[11px] text-zinc-400 font-mono">{print.note}</p>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">
                        {print.remaining > 0 ? `${print.remaining} Available` : "Claimed"}
                      </span>
                    </div>
                  </div>
                ))}

                <p className="text-[11px] text-zinc-400 font-mono pt-1">
                  💡 You can select and frame your photos directly inside your photo vault once your proofs are ready.
                </p>
              </div>
            </div>
          )}

          {/* Card: Client Notes & Creative Brief (if provided) */}
          {booking.creativeBrief && (
            <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-zinc-800/80 pb-3">
                <MessageSquare className="size-4 text-amber-400" />
                <h2>Your Notes & Special Requests</h2>
              </div>
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/70 text-xs sm:text-sm text-zinc-300 italic leading-relaxed">
                &ldquo;{booking.creativeBrief}&rdquo;
              </div>
            </div>
          )}

          {/* Card: Photo Vault & Delivered Deliverables (if present) */}
          {booking.project && allDeliverableItems.length > 0 && (
            <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <ImageIcon className="size-4 text-purple-400" />
                  <h2>Delivered Photos & Vault ({allDeliverableItems.length})</h2>
                </div>
                <Link
                  href={studioPath(tenant.slug, `/vault/${booking.project.id}`)}
                  className="text-xs font-mono text-amber-400 hover:underline flex items-center gap-1"
                >
                  <span>Open Full Vault</span>
                  <ChevronRight className="size-3" />
                </Link>
              </div>

              {/* Photo preview thumbnails grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {allDeliverableItems.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden relative group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.thumbnailUrl || item.previewUrl}
                      alt={item.title}
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1 text-center">
                      <span className="text-[11px] text-white font-mono line-clamp-1">
                        {item.title}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <p className="text-xs text-zinc-400">
                  {photosCount} photo proofs ready for viewing, favorites and high-res download.
                </p>
                <Link
                  href={studioPath(tenant.slug, `/vault/${booking.project.id}`)}
                  className={buttonVariants({ size: "sm" })}
                >
                  <Eye className="size-3.5" />
                  <span>View All Photos</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: FINANCIALS, INVOICES & STUDIO CONTACT      */}
        {/* ======================================================== */}
        <div className="space-y-6">
          {/* Card: Financial Breakdown & Payments */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-zinc-800/80 pb-3">
              <Receipt className="size-4 text-amber-400" />
              <h2>Payment Summary</h2>
            </div>

            <div className="space-y-3">
              {/* Total Session Price */}
              <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">Total Session Price</span>
                <span className="font-bold text-white font-mono text-sm">
                  {money(sessionPrice)}
                </span>
              </div>

              {/* Deposit Required */}
              <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-800/60">
                <div className="space-y-0.5">
                  <span className="text-zinc-400 block">Initial Deposit</span>
                  <span
                    className={cn(
                      "text-[11px] font-mono px-1.5 py-0.5 rounded border uppercase",
                      isDepositPaid
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    )}
                  >
                    {isDepositPaid ? "Paid" : "Unpaid"}
                  </span>
                </div>
                <span className="font-bold text-white font-mono">
                  {money(depositAmount)}
                </span>
              </div>

              {/* Remaining Balance */}
              <div className="flex items-center justify-between text-xs py-1">
                <div className="space-y-0.5">
                  <span className="text-zinc-400 block">Remaining Balance</span>
                  <span
                    className={cn(
                      "text-[11px] font-mono px-1.5 py-0.5 rounded border uppercase",
                      balanceRemaining === 0 || booking.project?.isFinalBalancePaid
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    )}
                  >
                    {balanceRemaining === 0 || booking.project?.isFinalBalancePaid
                      ? "Settled"
                      : "Pending"}
                  </span>
                </div>
                <span className="font-black text-amber-400 font-mono text-sm">
                  {money(balanceRemaining)}
                </span>
              </div>

              {/* Payment Method Badge */}
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs font-mono space-y-1">
                <span className="text-[11px] uppercase text-zinc-400 block">
                  Payment Method
                </span>
                <p className="font-semibold text-zinc-200">
                  {getPaymentMethodLabel(booking.paymentMethod)}
                </p>
                {tenant.bankDetails && (
                  <p className="text-[11px] text-zinc-400 pt-0.5">
                    Studio Bank: {tenant.bankDetails}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Card: Linked Milestone Invoices */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <CreditCard className="size-4 text-amber-400" />
                <h2>Official Invoices ({booking.invoices.length})</h2>
              </div>
            </div>

            {booking.invoices.length === 0 ? (
              <p className="text-xs text-zinc-400 py-2">
                No invoices have been generated for this booking yet.
              </p>
            ) : (
              <div className="space-y-3">
                {booking.invoices.map((inv) => {
                  const invBadge = getInvoiceStatusBadge(inv.status);
                  const isUnpaid = inv.status === "PENDING" || inv.status === "OVERDUE";

                  return (
                    <div
                      key={inv.id}
                      className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2.5 transition-colors hover:border-zinc-700"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white font-mono">
                              #{inv.invoiceNumber}
                            </span>
                            <span
                              className={cn(
                                "text-[11px] font-mono px-1.5 py-0.2 rounded border uppercase font-bold",
                                invBadge.className
                              )}
                            >
                              {invBadge.label}
                            </span>
                          </div>
                          <span className="text-[11px] text-zinc-400 block pt-0.5">
                            {inv.milestoneType === "BOOKING_DEPOSIT"
                              ? "Deposit Milestone"
                              : inv.milestoneType === "BOOKING_BALANCE"
                              ? "Balance Milestone"
                              : "Service Milestone"}
                          </span>
                        </div>

                        <span className="text-xs font-bold font-mono text-white">
                          {money(inv.amount)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/60">
                        <Link
                          href={studioPath(tenant.slug, `/account/invoices/${inv.id}`)}
                          className="text-[11px] font-mono text-zinc-400 hover:text-white inline-flex items-center gap-1"
                        >
                          <FileText className="size-3" />
                          <span>View Invoice</span>
                        </Link>

                        {isUnpaid && (
                          <Link
                            href={studioPath(tenant.slug, `/checkout?invoiceId=${inv.id}`)}
                            className={cn(
                              buttonVariants({ size: "sm" }),
                              "h-7 text-xs font-mono font-bold"
                            )}
                            style={{ backgroundColor: accentColor, color: "#000" }}
                          >
                            <CreditCard className="size-3" />
                            <span>Pay Now</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card: Studio Support & Contact */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="size-4 text-amber-400" />
              <span>Studio Assistance</span>
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Need to reschedule your session or have inquiries regarding your creative requirements? Contact our studio directly:
            </p>

            <div className="space-y-1.5 text-xs font-mono pt-1">
              <div className="text-zinc-300">
                <strong>{tenant.name}</strong>
              </div>
              {studioOwner?.email && (
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Mail className="size-3 text-amber-400" />
                  <a href={`mailto:${studioOwner.email}`} className="hover:underline">
                    {studioOwner.email}
                  </a>
                </div>
              )}
              {studioOwner?.phone && (
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Phone className="size-3 text-amber-400" />
                  <a href={`tel:${studioOwner.phone}`} className="hover:underline">
                    {studioOwner.phone}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

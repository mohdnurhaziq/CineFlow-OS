"use client";

import { useState } from "react";
import Link from "next/link";
import {
  X,
  Clock,
  MapPin,
  Phone,
  MessageCircle,
  Mail,
  Camera,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Package as PackageIcon,
  Layers,
  Images,
  ExternalLink,
  Copy,
  Check,
  User,
  Share2,
  Eye,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { STUDIO_TIME_ZONE } from "@/lib/slot-time";
import { studioPath } from "@/lib/domain-name";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ScheduleSession } from "@/lib/bookings/schedule";

interface ShootDetailsDialogProps {
  session: ScheduleSession;
  tenantSlug: string;
  tenantName: string;
  tenantBio?: string | null;
  currency: string;
  brandColor?: string | null;
  onClose: () => void;
  isOpen: boolean;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  CONFIRMED: {
    label: "Confirmed",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: CheckCircle2,
  },
  PENDING: {
    label: "Awaiting Verification",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: Clock,
  },
  COMPLETED: {
    label: "Session Done",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: Camera,
  },
  DELIVERED: {
    label: "Delivered",
    badgeClass: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    icon: Sparkles,
  },
  NO_SHOW: {
    label: "Missed",
    badgeClass: "bg-zinc-800 text-zinc-400 border-zinc-700",
    icon: AlertCircle,
  },
  CANCELLED: {
    label: "Cancelled",
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    icon: AlertCircle,
  },
};

const digitsOf = (phone: string) => phone.replace(/\D/g, "");

export function ShootDetailsDialog({
  session,
  tenantSlug,
  tenantName,
  tenantBio,
  currency,
  brandColor,
  onClose,
  isOpen,
}: ShootDetailsDialogProps) {
  const [copiedBrief, setCopiedBrief] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const accentColor = brandColor || "#f59e0b";
  const money = (val: number) => formatMoney(currency, val);

  const statusInfo = STATUS_CONFIG[session.status] ?? {
    label: session.status,
    badgeClass: "bg-zinc-800 text-zinc-400 border-zinc-700",
    icon: Clock,
  };
  const StatusIcon = statusInfo.icon;

  const digits = digitsOf(session.clientPhone);

  // Location logic: call sheet location > studio fallback
  const locationName = session.callSheet?.locationName || tenantName;
  const locationAddress = session.callSheet?.locationAddress || tenantBio || "In-Studio Session";
  const locationMapUrl =
    session.callSheet?.locationPinUrl ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${locationName} ${locationAddress}`)}`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(session.trackingCode);
      setCopiedCode(true);
      toast.success("Tracking code copied!");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  const handleCopyShootBrief = async () => {
    const briefText = `📸 *SHOOT BRIEF: ${session.category.toUpperCase()} — ${session.packageName || "SESSION"}*
📋 *Booking Code:* #${session.trackingCode}
⏰ *Time:* ${session.startTime} – ${session.endTime} (${STUDIO_TIME_ZONE})
${session.callSheet?.generalCallTime ? `⏱️ *Crew Call Time:* ${session.callSheet.generalCallTime}\n` : ""}📍 *Location:* ${locationName} (${locationAddress})
👤 *Client:* ${session.clientName} (${session.clientPhone})
📦 *Deliverables:* ${session.package?.deliverables || "Standard photo package"}
⏳ *Turnaround:* ${session.package?.turnaround || "5–7 business days"}
💰 *Deposit:* ${session.depositPaid ? `Paid (${money(session.depositAmount)})` : "Unpaid"}
${session.brief ? `📝 *Client Notes:* "${session.brief}"\n` : ""}${session.others.length > 0 ? `👥 *Crew:* ${session.others.join(", ")}\n` : ""}`;

    try {
      await navigator.clipboard.writeText(briefText);
      setCopiedBrief(true);
      toast.success("Shoot brief copied for WhatsApp!");
      setTimeout(() => setCopiedBrief(false), 2000);
    } catch {
      toast.error("Failed to copy brief");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in-0 duration-200">
      <div
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-[#0e0e11] border border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-zinc-800/80 bg-[#121215]">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider"
              style={{
                backgroundColor: `${accentColor}20`,
                color: accentColor,
                border: `1px solid ${accentColor}40`,
              }}
            >
              {session.category.replace(/_/g, " ")}
            </span>

            <button
              type="button"
              onClick={handleCopyCode}
              className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded hover:text-white transition-colors inline-flex items-center gap-1"
              title="Click to copy tracking code"
            >
              <span>#{session.trackingCode}</span>
              {copiedCode ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3 text-zinc-500" />}
            </button>

            {session.serviceTier && (
              <span className="text-xs font-mono text-zinc-400 border border-zinc-800/60 px-2 py-0.5 rounded bg-zinc-900/40 hidden sm:inline-block">
                {session.serviceTier}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={studioPath(tenantSlug, `/admin/schedule/${session.bookingId}`)}
              className="text-xs font-mono text-zinc-400 hover:text-white hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-800/60 transition-colors"
              title="Open full page view"
            >
              <ExternalLink className="size-3" />
              <span>Full Page</span>
            </Link>

            <button
              type="button"
              onClick={onClose}
              className="size-8 rounded-lg border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
              aria-label="Close dialog"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-left text-zinc-100">
          {/* Main Title & Status Hero */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-zinc-800/80">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {session.packageName ? `${session.packageName} Shoot` : `${session.category} Session`}
              </h2>
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                <span>Client: <strong className="text-white">{session.clientName}</strong></span>
                <span>·</span>
                <span>Discipline: <strong className="text-white">{session.discipline}</strong></span>
              </div>
            </div>

            <div className="flex flex-col items-start sm:items-end gap-1.5 flex-shrink-0">
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-mono font-bold uppercase tracking-wide",
                  statusInfo.badgeClass
                )}
              >
                <StatusIcon className="size-3.5" />
                <span>{statusInfo.label}</span>
              </div>

              <span
                className={cn(
                  "text-[10px] font-mono px-2 py-0.5 rounded border uppercase",
                  session.depositPaid
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                )}
              >
                Deposit: {session.depositPaid ? `Paid (${money(session.depositAmount)})` : "Unpaid"}
              </span>
            </div>
          </div>

          {/* Grid Section 1: Appointment & Location Logistics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Appointment Schedule */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-white font-mono uppercase tracking-wider">
                <Clock className="size-4 text-amber-400" />
                <span>Session Time & Call</span>
              </div>
              <div className="space-y-1 pt-1">
                <p className="text-base font-black text-white font-mono">
                  {session.startTime ? `${session.startTime} – ${session.endTime}` : "Time to be confirmed"}
                </p>
                {session.callSheet?.generalCallTime && (
                  <p className="text-xs font-mono text-amber-400 font-bold">
                    ⏰ Call Time: {session.callSheet.generalCallTime}
                  </p>
                )}
                <p className="text-[11px] font-mono text-zinc-500">
                  Timezone: {STUDIO_TIME_ZONE}
                </p>
              </div>
            </div>

            {/* Location & Venue */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-white font-mono uppercase tracking-wider">
                  <MapPin className="size-4 text-amber-400" />
                  <span>Shoot Location</span>
                </div>
                <a
                  href={locationMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-mono text-amber-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>Maps</span>
                  <ExternalLink className="size-2.5" />
                </a>
              </div>
              <div className="space-y-0.5 pt-1">
                <p className="text-sm font-bold text-white line-clamp-1">{locationName}</p>
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{locationAddress}</p>
                {session.callSheet?.parkingNotes && (
                  <p className="text-[11px] font-mono text-zinc-500 pt-0.5">
                    🚗 {session.callSheet.parkingNotes}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Grid Section 2: Client Contact Details & Quick Call/WhatsApp */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-white font-mono uppercase tracking-wider">
                <User className="size-4 text-amber-400" />
                <span>Client Contact</span>
              </div>
              <span className="text-xs font-mono text-zinc-400">{session.clientEmail}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div>
                <p className="text-sm font-bold text-white">{session.clientName}</p>
                <p className="text-xs font-mono text-zinc-400">{session.clientPhone}</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {digits && (
                  <>
                    <a
                      href={`tel:${session.clientPhone.replace(/[^\d+]/g, "")}`}
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                        "h-8 text-xs font-mono flex items-center gap-1.5"
                      )}
                    >
                      <Phone className="size-3.5 text-emerald-400" />
                      <span>Call</span>
                    </a>

                    <a
                      href={`https://wa.me/${digits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                        "h-8 text-xs font-mono flex items-center gap-1.5"
                      )}
                    >
                      <MessageCircle className="size-3.5 text-emerald-400" />
                      <span>WhatsApp</span>
                    </a>
                  </>
                )}

                {session.clientEmail && (
                  <a
                    href={`mailto:${session.clientEmail}`}
                    className={cn(
                      buttonVariants({ variant: "secondary", size: "sm" }),
                      "h-8 text-xs font-mono flex items-center gap-1.5"
                    )}
                  >
                    <Mail className="size-3.5 text-blue-400" />
                    <span>Email</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Package Deliverables & Scope */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-white font-mono uppercase tracking-wider">
              <PackageIcon className="size-4 text-amber-400" />
              <span>Package Deliverables & Production Requirements</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-850 space-y-1">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                  Expected Deliverables
                </span>
                <p className="font-semibold text-zinc-200">
                  {session.package?.deliverables || "Standard digital softcopy"}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-850 space-y-1">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                  Promised Turnaround
                </span>
                <p className="font-semibold text-zinc-200">
                  {session.package?.turnaround || "5–7 business days"}
                </p>
              </div>
            </div>

            {session.package?.description && (
              <div className="text-xs text-zinc-300 bg-zinc-950/40 p-3 rounded-lg border border-zinc-850/60 leading-relaxed">
                <strong className="text-white block mb-0.5">Package Scope:</strong>
                {session.package.description}
              </div>
            )}
          </div>

          {/* Section 4: Creative Brief & Client Notes */}
          {session.brief && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 font-mono uppercase tracking-wider">
                <span>Client Requests & Creative Brief</span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap italic">
                &ldquo;{session.brief}&rdquo;
              </p>
            </div>
          )}

          {/* Section 5: Included Framed Prints (if any) */}
          {session.includedPrints && session.includedPrints.length > 0 && (
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-white font-mono uppercase tracking-wider">
                <Layers className="size-4 text-amber-400" />
                <span>Included Prints Promised ({session.includedPrints.length})</span>
              </div>
              <div className="space-y-1.5">
                {session.includedPrints.map((print) => (
                  <div
                    key={print.id}
                    className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-850 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-white">{print.quantity}x {print.sizeName}</span>
                      <span className="text-zinc-400 ml-2">Frame: {print.frameName}</span>
                    </div>
                    {print.note && <span className="text-[10px] font-mono text-zinc-500">{print.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 6: Assigned Team & Crew */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white font-mono uppercase tracking-wider">
              <User className="size-4 text-amber-400" />
              <span>Assigned Photographers & Crew</span>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {session.allAssignees.map((a) => (
                <div
                  key={a.id}
                  className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-850 flex items-center gap-1.5 text-xs font-mono"
                >
                  <span className="font-semibold text-white">{a.name}</span>
                  <span className="text-[10px] text-zinc-400 bg-zinc-900 px-1.5 py-0.2 rounded">
                    {a.roleName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Bottom Action Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-zinc-800/80 bg-[#121215]">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleCopyShootBrief}
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "h-8 text-xs font-mono flex items-center gap-1.5"
              )}
            >
              {copiedBrief ? <Check className="size-3.5 text-emerald-400" /> : <Share2 className="size-3.5 text-amber-400" />}
              <span>{copiedBrief ? "Brief Copied!" : "Copy Shoot Brief (WhatsApp)"}</span>
            </button>

            {session.projectId && (
              <Link
                href={studioPath(tenantSlug, `/admin/projects/${session.projectId}`)}
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" }),
                  "h-8 text-xs font-mono flex items-center gap-1.5"
                )}
              >
                <Images className="size-3.5 text-amber-400" />
                <span>Upload Photos / Gallery</span>
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Link
              href={studioPath(tenantSlug, `/admin/bookings/${session.bookingId}`)}
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-8 text-xs font-mono font-bold"
              )}
              style={{ backgroundColor: accentColor, color: "#000" }}
            >
              <Eye className="size-3.5" />
              <span>Full Booking Record</span>
            </Link>

            <button
              type="button"
              onClick={onClose}
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "h-8 text-xs font-mono"
              )}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

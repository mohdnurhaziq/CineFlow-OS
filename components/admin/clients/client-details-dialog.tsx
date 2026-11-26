"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  User,
  Mail,
  Phone,
  CalendarCheck,
  Clapperboard,
  Receipt,
  FileText,
  ExternalLink,
  Copy,
  Check,
  MessageCircle,
  Clock,
  Sparkles,
  Loader2,
  DollarSign,
  AlertCircle,
  FolderOpen,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { studioPath } from "@/lib/domain-name";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ClientAccountBadge } from "@/components/admin/clients/client-account-badge";
import { getClientQuickProfile, type QuickClientProfile } from "@/lib/actions/admin-clients";
import type { ClientDirectoryRow } from "@/lib/client-directory";
import { DialogCloseButton } from "@/components/ui/dialog-close-button";

interface ClientDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clientRow: ClientDirectoryRow | null;
  tenantId: string;
  tenantSlug: string;
  currency: string;
  showMoney: boolean;
}

const BOOKING_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  CONFIRMED: { label: "Confirmed", badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  PENDING: { label: "Pending Verification", badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  COMPLETED: { label: "Session Done", badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  DELIVERED: { label: "Delivered", badgeClass: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  NO_SHOW: { label: "No-Show", badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  CANCELLED: { label: "Cancelled", badgeClass: "bg-zinc-800 text-zinc-400 border-zinc-700" },
};

const INVOICE_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  PAID: { label: "Paid", badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  PENDING: { label: "Unpaid", badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  OVERDUE: { label: "Overdue", badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  PENDING_VERIFICATION: { label: "Verification Due", badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  REJECTED: { label: "Rejected", badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  VOID: { label: "Void", badgeClass: "bg-zinc-800 text-zinc-400 border-zinc-700" },
};

function humanize(val: string) {
  return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ClientDetailsDialog({
  isOpen,
  onClose,
  clientRow,
  tenantId,
  tenantSlug,
  currency,
  showMoney,
}: ClientDetailsDialogProps) {
  const [profile, setProfile] = useState<QuickClientProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"bookings" | "galleries" | "invoices" | "notes">("bookings");
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  useEffect(() => {
    if (!isOpen || !clientRow) {
      setProfile(null);
      return;
    }

    let active = true;
    setLoading(true);

    getClientQuickProfile(tenantId, clientRow.id).then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.success) {
        setProfile(res.profile);
      }
    });

    return () => {
      active = false;
    };
  }, [isOpen, clientRow, tenantId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !clientRow) return null;

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(clientRow.email);
      setCopiedEmail(true);
      toast.success("Email copied to clipboard!");
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      toast.error("Failed to copy email");
    }
  };

  const handleCopyPhone = async () => {
    if (!clientRow.phone) return;
    try {
      await navigator.clipboard.writeText(clientRow.phone);
      setCopiedPhone(true);
      toast.success("Phone number copied!");
      setTimeout(() => setCopiedPhone(false), 2000);
    } catch {
      toast.error("Failed to copy phone");
    }
  };

  const cleanPhone = (clientRow.phone ?? "").replace(/[^0-9]/g, "");
  const whatsappUrl = cleanPhone
    ? `https://wa.me/${cleanPhone.startsWith("0") ? `6${cleanPhone}` : cleanPhone}`
    : null;

  const bookingsCount = profile?.bookings.length ?? clientRow.bookingCount;
  const projectsCount = profile?.projects.length ?? clientRow.projectCount;
  const invoicesCount = profile?.invoices.length ?? 0;
  const paidAmount = profile?.money?.paid ?? clientRow.paid ?? 0;
  const outstandingAmount = profile?.money?.outstanding ?? clientRow.outstanding ?? 0;
  const staffNotes = profile?.client.staffNotes ?? "";

  const fullProfileUrl = studioPath(tenantSlug, `/admin/clients/${clientRow.id}`);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in-0 duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-[#0d0d10] border border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-dialog-title"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-zinc-800 bg-[#121215]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
              <User className="size-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="client-dialog-title" className="text-base font-bold text-white tracking-tight truncate">
                  {clientRow.name}
                </h2>
                <ClientAccountBadge status={clientRow.accountStatus} />
              </div>
              <p className="text-xs text-zinc-400 font-mono truncate">{clientRow.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={fullProfileUrl}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
            >
              <span>Full Profile</span>
              <ExternalLink className="size-3" />
            </Link>
            <DialogCloseButton onClick={onClose} />
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto max-h-[calc(92vh-140px)]">
          {/* Quick Contact & Info Card */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                <div className="flex items-center gap-2 text-zinc-300 truncate">
                  <Mail className="size-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">{clientRow.email}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="p-1 rounded text-zinc-400 hover:text-white transition-colors ml-2 shrink-0"
                  title="Copy email"
                >
                  {copiedEmail ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                <div className="flex items-center gap-2 text-zinc-300 truncate">
                  <Phone className="size-3.5 text-zinc-400 shrink-0" />
                  <span>{clientRow.phone || "No phone added"}</span>
                </div>
                {clientRow.phone && (
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={handleCopyPhone}
                      className="p-1 rounded text-zinc-400 hover:text-white transition-colors"
                      title="Copy phone"
                    >
                      {copiedPhone ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                    </button>
                    {whatsappUrl && (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                        title="Chat on WhatsApp"
                      >
                        <MessageCircle className="size-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-1 border-t border-zinc-800/60">
              <span>Client since: {clientRow.clientSinceDate}</span>
              <span>Last active: {clientRow.lastActivityLabel}</span>
            </div>
          </div>

          {/* Quick Stat Tiles */}
          <div className={cn("grid grid-cols-2 gap-2.5", showMoney ? "sm:grid-cols-4" : "sm:grid-cols-2")}>
            <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
              <span className="text-[11px] font-mono uppercase text-zinc-400 block">Bookings</span>
              <span className="text-xl font-bold font-mono text-white mt-0.5 block tabular-nums">{bookingsCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
              <span className="text-[11px] font-mono uppercase text-zinc-400 block">Galleries</span>
              <span className="text-xl font-bold font-mono text-white mt-0.5 block tabular-nums">{projectsCount}</span>
            </div>
            {showMoney && (
              <>
                <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
                  <span className="text-[11px] font-mono uppercase text-zinc-400 block">Total Paid</span>
                  <span className="text-xl font-bold font-mono text-white mt-0.5 block tabular-nums">
                    {formatMoney(currency, paidAmount)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
                  <span className="text-[11px] font-mono uppercase text-zinc-400 block">Balance Due</span>
                  <span
                    className={cn(
                      "text-xl font-bold font-mono mt-0.5 block tabular-nums",
                      outstandingAmount > 0 ? "text-amber-400 font-black" : "text-zinc-400"
                    )}
                  >
                    {outstandingAmount > 0 ? formatMoney(currency, outstandingAmount) : formatMoney(currency, 0)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-2.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab("bookings")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-1.5 whitespace-nowrap",
                activeTab === "bookings"
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              )}
            >
              <CalendarCheck className="size-3.5" />
              <span>Bookings ({bookingsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("galleries")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-1.5 whitespace-nowrap",
                activeTab === "galleries"
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              )}
            >
              <Clapperboard className="size-3.5" />
              <span>Galleries ({projectsCount})</span>
            </button>
            {showMoney && (
              <button
                type="button"
                onClick={() => setActiveTab("invoices")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-1.5 whitespace-nowrap",
                  activeTab === "invoices"
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                )}
              >
                <Receipt className="size-3.5" />
                <span>Invoices ({invoicesCount})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab("notes")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-1.5 whitespace-nowrap",
                activeTab === "notes"
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              )}
            >
              <FileText className="size-3.5" />
              <span>Staff Notes</span>
            </button>
          </div>

          {/* Tab Content */}
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs font-mono text-zinc-400">
              <Loader2 className="size-5 animate-spin text-amber-400" />
              <span>Loading detailed client records…</span>
            </div>
          ) : (
            <div>
              {/* Tab: Bookings */}
              {activeTab === "bookings" && (
                <div className="space-y-2">
                  {(!profile || profile.bookings.length === 0) ? (
                    <div className="py-8 text-center text-xs font-mono text-zinc-400 border border-dashed border-zinc-800/80 rounded-xl">
                      No bookings recorded for this client.
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-800/60 border border-zinc-800 rounded-xl bg-zinc-900/30 overflow-hidden">
                      {profile.bookings.map((b) => {
                        const statusConfig = BOOKING_STATUS_CONFIG[b.status] ?? {
                          label: humanize(b.status),
                          badgeClass: "bg-zinc-800 text-zinc-300 border-zinc-700",
                        };
                        return (
                          <div
                            key={b.id}
                            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-800/30 transition-colors"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-white">{b.trackingCode}</span>
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[11px] font-mono border font-semibold",
                                    statusConfig.badgeClass
                                  )}
                                >
                                  {statusConfig.label}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-400 font-mono">
                                {b.packageName || humanize(b.serviceTier)}
                                {b.targetDate ? ` · ${b.targetDate}` : ""}
                              </p>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 font-mono text-xs">
                              {showMoney && b.sessionPrice != null && (
                                <span className="text-white font-bold tabular-nums">
                                  {formatMoney(currency, b.sessionPrice)}
                                </span>
                              )}
                              <Link
                                href={studioPath(tenantSlug, `/admin/bookings/${b.id}`)}
                                className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
                              >
                                View booking <ExternalLink className="size-3" />
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Galleries */}
              {activeTab === "galleries" && (
                <div className="space-y-2">
                  {(!profile || profile.projects.length === 0) ? (
                    <div className="py-8 text-center text-xs font-mono text-zinc-400 border border-dashed border-zinc-800/80 rounded-xl">
                      No galleries or deliverables for this client yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-800/60 border border-zinc-800 rounded-xl bg-zinc-900/30 overflow-hidden">
                      {profile.projects.map((p) => (
                        <div
                          key={p.id}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-800/30 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-white">{p.title}</span>
                              <span className="px-1.5 py-0.5 rounded text-[11px] font-mono border bg-zinc-800 text-zinc-300 border-zinc-700">
                                {humanize(p.status)}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-400 font-mono">
                              #{p.projectNumber}
                              {p.shootDates ? ` · ${p.shootDates}` : ""}
                            </p>
                          </div>

                          <Link
                            href={studioPath(tenantSlug, `/admin/projects/${p.id}`)}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400 hover:underline self-start sm:self-auto"
                          >
                            Open gallery <ExternalLink className="size-3" />
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Invoices */}
              {showMoney && activeTab === "invoices" && (
                <div className="space-y-2">
                  {(!profile || profile.invoices.length === 0) ? (
                    <div className="py-8 text-center text-xs font-mono text-zinc-400 border border-dashed border-zinc-800/80 rounded-xl">
                      No invoices issued for this client yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-800/60 border border-zinc-800 rounded-xl bg-zinc-900/30 overflow-hidden">
                      {profile.invoices.map((inv) => {
                        const statusConfig = INVOICE_STATUS_CONFIG[inv.status] ?? {
                          label: humanize(inv.status),
                          badgeClass: "bg-zinc-800 text-zinc-300 border-zinc-700",
                        };
                        return (
                          <div
                            key={inv.id}
                            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-800/30 transition-colors"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-white">{inv.invoiceNumber}</span>
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[11px] font-mono border font-semibold",
                                    statusConfig.badgeClass
                                  )}
                                >
                                  {statusConfig.label}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-400 font-mono">
                                {inv.description || humanize(inv.milestoneType)} · Due {inv.dueDate.slice(0, 10)}
                              </p>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 font-mono text-xs">
                              <span className="text-white font-bold tabular-nums">
                                {formatMoney(currency, inv.amount)}
                              </span>
                              <Link
                                href={studioPath(tenantSlug, `/admin/invoices/${inv.id}`)}
                                className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
                              >
                                View invoice <ExternalLink className="size-3" />
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Notes */}
              {activeTab === "notes" && (
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">Studio Staff Notes</h3>
                  {staffNotes ? (
                    <p className="text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed font-mono">{staffNotes}</p>
                  ) : (
                    <p className="text-xs text-zinc-400 font-mono italic">
                      No private staff notes on this client account. Open the full profile to add notes.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-t border-zinc-800 bg-[#121215]">
          <button
            type="button"
            onClick={onClose}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs font-mono text-zinc-400")}
          >
            Close
          </button>

          <Link
            href={fullProfileUrl}
            className={cn(buttonVariants({ variant: "primary", size: "sm" }), "text-xs font-mono font-semibold")}
          >
            <FolderOpen className="size-3.5" />
            <span>Open Full Client Record</span>
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

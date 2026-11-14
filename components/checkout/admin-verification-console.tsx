"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Clock,
  QrCode,
  Banknote,
  Search,
  Filter,
  AlertTriangle,
  User,
  DollarSign,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { ReceiptLightboxModal } from "./receipt-lightbox-modal";
import { VerificationQueue } from "./verification-queue";
import {
  approvePaymentVerification,
  rejectPaymentVerification,
} from "@/lib/actions/admin-verification";
import { useDialog } from "@/lib/use-dialog";
import { humanize, invoiceStatusLabel, milestoneLabel } from "@/lib/labels";
import { sameCategory } from "@/lib/bookings/pricing-shared";
import { STUDIO_TIME_ZONE } from "@/lib/slot-time";

export interface AdminVerificationConsoleProps {
  /** The signed-in staff member; the server records approvals and rejections under this name. */
  verifierName: string;
  /** Approving and rejecting payments is owner-only; staff can review the queue. */
  isOwner?: boolean;
  /** Category slug -> display name, so bookings show "Studio Portraits", not "studio-portrait". */
  categoryNames?: Record<string, string>;
  tenant: {
    id: string;
    name: string;
    slug: string;
    currency: string;
  };
  pendingInvoices: Array<{
    id: string;
    invoiceNumber: string;
    milestoneType: string;
    amount: number;
    status: string;
    paymentMethod: string | null;
    paymentProofUrl: string | null;
    paymentReference: string | null;
    createdAt: Date | string;
    client: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
    };
    project?: {
      id: string;
      title: string;
      projectNumber: string;
    } | null;
    booking?: {
      id: string;
      trackingCode: string;
      category: string;
      targetDate: string | null;
      slot?: {
        date?: string;
        startTime: string;
        endTime: string;
      } | null;
    } | null;
  }>;
  historyInvoices: Array<{
    id: string;
    invoiceNumber: string;
    milestoneType: string;
    amount: number;
    status: string;
    paymentMethod: string | null;
    verifiedBy: string | null;
    paidAt: Date | string | null;
    createdAt: Date | string;
    client: {
      name: string;
      email: string;
    };
  }>;
}

export function AdminVerificationConsole({
  tenant,
  verifierName,
  isOwner = true,
  categoryNames = {},
  pendingInvoices: initialPending,
  historyInvoices: initialHistory,
}: AdminVerificationConsoleProps) {
  const currencySymbol = tenant.currency === "MYR" ? "RM " : "$";

  const [activeTab, setActiveTab] = useState<"ALL" | "QR" | "CASH" | "HISTORY">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [lightboxData, setLightboxData] = useState<{
    url: string;
    invoiceNumber: string;
    clientName: string;
    amount: number;
    reference?: string | null;
    submittedAt?: Date | string;
  } | null>(null);

  const [isPending, startTransition] = useTransition();
  const categoryName = (slug: string) =>
    Object.entries(categoryNames).find(([s]) => sameCategory(s, slug))?.[1] ?? humanize(slug);

  // Rejection modal state
  const [rejectModalItem, setRejectModalItem] = useState<{
    id: string;
    invoiceNumber: string;
    clientName: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("Illegible receipt screenshot");
  const rejectDialog = useDialog(rejectModalItem !== null, () => setRejectModalItem(null));

  const qrPending = initialPending.filter((i) => i.paymentMethod === "QR_CODE");
  const cashPending = initialPending.filter((i) => i.paymentMethod === "CASH");
  const totalPendingVolume = initialPending.reduce((acc, curr) => acc + curr.amount, 0);

  // Filter pending items based on tab & search
  const filteredPending = initialPending.filter((item) => {
    if (activeTab === "QR" && item.paymentMethod !== "QR_CODE") return false;
    if (activeTab === "CASH" && item.paymentMethod !== "CASH") return false;

    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      item.invoiceNumber.toLowerCase().includes(q) ||
      item.client.name.toLowerCase().includes(q) ||
      item.client.email.toLowerCase().includes(q) ||
      (item.paymentReference && item.paymentReference.toLowerCase().includes(q)) ||
      (item.booking?.trackingCode && item.booking.trackingCode.toLowerCase().includes(q))
    );
  });

  const handleApprove = (invoiceId: string, invoiceNumber: string) => {
    startTransition(async () => {
      const res = await approvePaymentVerification({
        invoiceId,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      });

      if (res.success) {
        if (res.whatsappUrl) {
          toast.success(`Invoice ${invoiceNumber} approved and marked as PAID!`, {
            action: {
              label: "WhatsApp Receipt",
              onClick: () => window.open(res.whatsappUrl, "_blank"),
            },
            duration: 9000,
          });
        } else {
          toast.success(`Invoice ${invoiceNumber} approved and marked as PAID!`);
        }
        if (res.unlockedDownloads) {
          toast.success("Final balance settled: Master download vault unlocked.");
        }
      } else {
        toast.error(res.message || "Failed to approve payment.");
      }
    });
  };

  const handleRejectConfirm = () => {
    if (!rejectModalItem) return;

    startTransition(async () => {
      const res = await rejectPaymentVerification({
        invoiceId: rejectModalItem.id,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        reason: rejectReason,
      });

      if (res.success) {
        if (res.whatsappUrl) {
          toast.success(`Slip for ${rejectModalItem.invoiceNumber} rejected.`, {
            action: {
              label: "WhatsApp Notice",
              onClick: () => window.open(res.whatsappUrl, "_blank"),
            },
            duration: 9000,
          });
        } else {
          toast.success(`Slip for ${rejectModalItem.invoiceNumber} rejected. The client has been asked for a new one.`);
        }
        setRejectModalItem(null);
      } else {
        toast.error(res.message || "Failed to reject payment.");
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Console Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 block mb-1">
            {tenant.name}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Payment verification
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Check QR transfer slips and cash payments against your bank or till, then approve them to confirm the booking.
          </p>
        </div>

        {/* Who approvals are recorded under: always the signed-in user. */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-2">
            <User className="size-4 text-amber-400" />
            <div className="text-xs">
              <span className="text-[10px] text-zinc-500 uppercase block font-mono">Verifying as</span>
              <span className="text-white font-medium">{verifierName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Highlight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Pending */}
        <div className="p-5 rounded-2xl bg-[#121215] border border-amber-500/20 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
              Awaiting Verification
            </span>
            <Clock className="size-4 text-amber-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white tracking-tight">
            {initialPending.length}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">Payments to check</p>
        </div>

        {/* Metric 2: QR Slip Uploads */}
        <div className="p-5 rounded-2xl bg-[#121215] border border-blue-500/20 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400">
              QR Slip Uploads
            </span>
            <QrCode className="size-4 text-blue-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white tracking-tight">
            {qrPending.length}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">Proof slips attached</p>
        </div>

        {/* Metric 3: Cash Counter Orders */}
        <div className="p-5 rounded-2xl bg-[#121215] border border-emerald-500/20 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
              Cash Counter
            </span>
            <Banknote className="size-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white tracking-tight">
            {cashPending.length}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">Paid at the studio</p>
        </div>

        {/* Metric 4: Total Volume Awaiting */}
        <div className="p-5 rounded-2xl bg-[#121215] border border-zinc-800 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
              Pending Volume
            </span>
            <DollarSign className="size-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-400 tracking-tight">
            {currencySymbol}
            {totalPendingVolume.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">Waiting to be confirmed</p>
        </div>
      </div>

      {/* Control Bar: Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-900 border border-zinc-800 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
              activeTab === "ALL"
                ? "bg-amber-500 text-black font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            All Pending ({initialPending.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("QR")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
              activeTab === "QR"
                ? "bg-amber-500 text-black font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            QR Slips ({qrPending.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("CASH")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
              activeTab === "CASH"
                ? "bg-amber-500 text-black font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Cash Counter ({cashPending.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("HISTORY")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
              activeTab === "HISTORY"
                ? "bg-amber-500 text-black font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Settlement History ({initialHistory.length})
          </button>
        </div>

        {/* Search Input */}
        {activeTab !== "HISTORY" && (
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-2.5 size-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Filter by invoice, client, ref..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-700 bg-[#16161b] text-white text-xs focus:outline-none focus:border-amber-500 font-sans"
            />
          </div>
        )}
      </div>

      {/* Feed View: Active Pending Queue */}
      {activeTab !== "HISTORY" ? (
        filteredPending.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-zinc-800 bg-[#121215] space-y-3">
            <CheckCircle2 className="size-10 text-emerald-400 mx-auto" />
            <h3 className="text-base font-bold text-white">All Caught Up!</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              There are no pending transactions awaiting verification in this category.
            </p>
          </div>
        ) : (
          <VerificationQueue
            items={filteredPending}
            tenantSlug={tenant.slug}
            currencySymbol={currencySymbol}
            isOwner={isOwner}
            isPending={isPending}
            categoryName={categoryName}
            onApprove={(item) => handleApprove(item.id, item.invoiceNumber)}
            onReject={(item) =>
              setRejectModalItem({ id: item.id, invoiceNumber: item.invoiceNumber, clientName: item.client.name })
            }
            onZoom={(item) =>
              setLightboxData({
                url: item.paymentProofUrl!,
                invoiceNumber: item.invoiceNumber,
                clientName: item.client.name,
                amount: item.amount,
                reference: item.paymentReference,
                submittedAt: item.createdAt,
              })
            }
          />
        )
      ) : (
        /* History View */
        <div className="p-6 rounded-2xl border border-zinc-800 bg-[#121215] shadow-xl overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-[10px] uppercase">
                <th className="pb-3 font-semibold">Invoice Number</th>
                <th className="pb-3 font-semibold">Client</th>
                <th className="pb-3 font-semibold">Milestone</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Amount</th>
                <th className="pb-3 font-semibold">Verified By</th>
                <th className="pb-3 font-semibold">Date Settled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {initialHistory.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-900/40">
                  <td className="py-3 font-bold text-white">{item.invoiceNumber}</td>
                  <td className="py-3 text-zinc-300 font-sans">{item.client.name}</td>
                  <td className="py-3 text-zinc-400">{milestoneLabel(item.milestoneType)}</td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.status === "PAID"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : item.status === "REJECTED"
                          ? "bg-red-500/10 text-red-400 border border-red-500/30"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {invoiceStatusLabel(item.status)}
                    </span>
                  </td>
                  <td className="py-3 text-white font-bold tabular-nums">
                    {currencySymbol}
                    {item.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 text-zinc-400">{item.verifiedBy || "—"}</td>
                  <td className="py-3 text-zinc-400">
                    {item.paidAt
                      ? new Date(item.paidAt).toLocaleDateString("en-US", {
                          dateStyle: "medium",
                          timeZone: STUDIO_TIME_ZONE,
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lightbox Modal for Slip Zoom */}
      {lightboxData && (
        <ReceiptLightboxModal
          isOpen={true}
          onClose={() => setLightboxData(null)}
          receiptUrl={lightboxData.url}
          invoiceNumber={lightboxData.invoiceNumber}
          clientName={lightboxData.clientName}
          amount={lightboxData.amount}
          currency={tenant.currency}
          paymentReference={lightboxData.reference}
          submittedAt={lightboxData.submittedAt}
        />
      )}

      {/* Reject Confirmation Dialog */}
      {rejectModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
          <div {...rejectDialog} aria-labelledby="reject-dialog-title" className="max-w-md w-full rounded-2xl border border-red-500/30 bg-[#121215] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-red-400 font-bold text-sm">
              <AlertTriangle className="size-5" />
              <span id="reject-dialog-title">Reject Payment Verification</span>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Rejecting invoice <strong className="text-white">{rejectModalItem.invoiceNumber}</strong> for{" "}
              <strong className="text-white">{rejectModalItem.clientName}</strong> asks them to send a new slip. Their booking and slot are kept for 24 hours; if no new slip arrives by then, the slot is released.
            </p>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase text-zinc-400">
                Rejection Reason (Recorded on Audit Trail)
              </label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-white text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="Illegible receipt screenshot">Illegible receipt screenshot</option>
                <option value="Incorrect transfer amount">Incorrect transfer amount</option>
                <option value="Beneficiary account mismatch">Beneficiary account mismatch</option>
                <option value="Transaction reference not found in bank statement">Transaction reference not found in bank statement</option>
                <option value="Counter cash was not received">Counter cash was not received</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalItem(null)}
                className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleRejectConfirm}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                {isPending && <Loader2 className="size-3.5 animate-spin" />}
                Reject slip &amp; ask for a new one
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

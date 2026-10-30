"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  QrCode,
  Banknote,
  Search,
  Filter,
  Eye,
  AlertTriangle,
  User,
  Calendar,
  DollarSign,
  Loader2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { ReceiptLightboxModal } from "./receipt-lightbox-modal";
import {
  approvePaymentVerification,
  rejectPaymentVerification,
} from "@/lib/actions/admin-verification";

interface AdminVerificationConsoleProps {
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
  const [staffName, setStaffName] = useState("Studio Lead");

  // Rejection modal state
  const [rejectModalItem, setRejectModalItem] = useState<{
    id: string;
    invoiceNumber: string;
    clientName: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("Illegible receipt screenshot");

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
        staffName,
      });

      if (res.success) {
        toast.success(`Invoice ${invoiceNumber} approved and marked as PAID!`);
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
        staffName,
        reason: rejectReason,
      });

      if (res.success) {
        toast.success(`Invoice ${rejectModalItem.invoiceNumber} rejected and slot released.`);
        setRejectModalItem(null);
      } else {
        toast.error(res.message || "Failed to reject payment.");
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Console Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 block mb-1">
            STUDIO VERIFICATION CONSOLE // {tenant.name.toUpperCase()}
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Manual Payment Authorization
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Review offline QR payment slips and cash counter deposits to lock studio slots and release master vaults.
          </p>
        </div>

        {/* Staff Identity Selector */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-2">
            <User className="size-4 text-amber-400" />
            <div className="text-xs">
              <span className="text-[10px] text-zinc-500 uppercase block font-mono">Verified By</span>
              <select
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer text-xs"
              >
                <option value="Studio Lead" className="bg-zinc-900 text-white">Studio Lead</option>
                <option value="Front Desk Concierge" className="bg-zinc-900 text-white">Front Desk Concierge</option>
                <option value="Production Manager" className="bg-zinc-900 text-white">Production Manager</option>
                <option value="Sarah Tan" className="bg-zinc-900 text-white">Sarah Tan</option>
                <option value="David Chong" className="bg-zinc-900 text-white">David Chong</option>
              </select>
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
          <p className="text-[11px] text-zinc-400 mt-1">Pending studio audit</p>
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
          <p className="text-[11px] text-zinc-400 mt-1">Front desk settlements</p>
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
          <p className="text-[11px] text-zinc-400 mt-1">Gross escrow pending</p>
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
          <div className="space-y-4">
            {filteredPending.map((item) => {
              const isQr = item.paymentMethod === "QR_CODE";
              const isCash = item.paymentMethod === "CASH";

              return (
                <div
                  key={item.id}
                  className="p-5 rounded-2xl border border-zinc-800 bg-[#121215] hover:border-zinc-700 transition-all shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                >
                  {/* Left: Invoice & Client info */}
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="font-bold text-white">{item.invoiceNumber}</span>
                      <span className="text-zinc-600">•</span>
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {item.milestoneType.replace(/_/g, " ")}
                      </span>
                      <span className="text-zinc-600">•</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                          isQr
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : isCash
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-zinc-800 text-zinc-300 border-zinc-700"
                        }`}
                      >
                        {item.paymentMethod || "UNKNOWN"}
                      </span>
                      <span className="text-zinc-500 text-[11px] ml-auto">
                        {new Date(item.createdAt).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Client Box */}
                      <div className="space-y-1">
                        <div className="text-[10px] font-mono uppercase text-zinc-500">Client Details</div>
                        <div className="font-semibold text-white">{item.client.name}</div>
                        <div className="text-zinc-400 text-[11px] font-mono truncate">
                          {item.client.email} {item.client.phone ? `• ${item.client.phone}` : ""}
                        </div>
                      </div>

                      {/* Shoot / Project Box */}
                      <div className="space-y-1">
                        <div className="text-[10px] font-mono uppercase text-zinc-500">
                          {item.project ? "Linked Project" : "Booking Session"}
                        </div>
                        {item.booking ? (
                          <>
                            <div className="font-semibold text-amber-400 font-mono text-xs">
                              {item.booking.trackingCode} ({item.booking.category})
                            </div>
                            <div className="text-zinc-400 text-[11px] font-mono">
                              {item.booking.targetDate}{" "}
                              {item.booking.slot
                                ? `• ${item.booking.slot.startTime} – ${item.booking.slot.endTime}`
                                : ""}
                            </div>
                          </>
                        ) : item.project ? (
                          <>
                            <div className="font-semibold text-white truncate">{item.project.title}</div>
                            <div className="text-zinc-400 text-[11px] font-mono">
                              #{item.project.projectNumber}
                            </div>
                          </>
                        ) : (
                          <div className="text-zinc-400 text-[11px]">Direct Studio Milestone</div>
                        )}
                      </div>
                    </div>

                    {/* Payment Reference Note */}
                    {item.paymentReference && (
                      <div className="text-[11px] font-mono text-zinc-400 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/80">
                        <span className="text-zinc-500 uppercase">Payment Note / Ref: </span>
                        <span className="text-white font-medium">{item.paymentReference}</span>
                      </div>
                    )}
                  </div>

                  {/* Middle: Evidence Thumbnail (Receipt Slip) */}
                  <div className="shrink-0 flex items-center">
                    {item.paymentProofUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxData({
                            url: item.paymentProofUrl!,
                            invoiceNumber: item.invoiceNumber,
                            clientName: item.client.name,
                            amount: item.amount,
                            reference: item.paymentReference,
                            submittedAt: item.createdAt,
                          })
                        }
                        className="group relative size-20 rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900 shadow-md hover:border-amber-500 transition-all cursor-pointer"
                        title="Click to zoom receipt"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.paymentProofUrl}
                          alt="Receipt slip"
                          className="size-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye className="size-5 text-amber-400" />
                        </div>
                        <span className="absolute bottom-1 right-1 bg-black/80 px-1 rounded text-[8px] font-mono text-amber-400 font-bold">
                          PROOF
                        </span>
                      </button>
                    ) : isCash ? (
                      <div className="size-20 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 flex flex-col items-center justify-center p-2 text-center">
                        <Banknote className="size-6 text-emerald-400" />
                        <span className="text-[9px] font-mono text-zinc-400 mt-1">Cash Desk</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Right: Amount & 1-Click Action Buttons */}
                  <div className="shrink-0 flex flex-col sm:items-end justify-between gap-3 border-t lg:border-t-0 pt-4 lg:pt-0">
                    <div className="text-left sm:text-right">
                      <div className="text-[10px] font-mono uppercase text-zinc-500">Amount Due</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-amber-400">
                        {currencySymbol}
                        {item.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          setRejectModalItem({
                            id: item.id,
                            invoiceNumber: item.invoiceNumber,
                            clientName: item.client.name,
                          })
                        }
                        className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-red-950/40 border border-zinc-800 hover:border-red-500/50 text-zinc-300 hover:text-red-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="size-3.5" />
                        <span>Reject</span>
                      </button>

                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleApprove(item.id, item.invoiceNumber)}
                        className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3.5" />
                        )}
                        <span>1-Click Approve</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
                  <td className="py-3 text-zinc-400">{item.milestoneType}</td>
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
                      {item.status}
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
          <div className="max-w-md w-full rounded-2xl border border-red-500/30 bg-[#121215] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-red-400 font-bold text-sm">
              <AlertTriangle className="size-5" />
              <span>Reject Payment Verification</span>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Rejecting invoice <strong className="text-white">{rejectModalItem.invoiceNumber}</strong> for{" "}
              <strong className="text-white">{rejectModalItem.clientName}</strong> will mark the invoice as REJECTED, cancel any pending booking, and release the held slot back to AVAILABLE on the public calendar.
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
                Confirm Rejection &amp; Release Slot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

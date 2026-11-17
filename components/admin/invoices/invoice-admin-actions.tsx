"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Banknote, Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { recordInvoicePayment, sendInvoiceReminder, voidInvoice } from "@/lib/actions/admin-invoices";
import { canRecordPaymentOn } from "@/lib/invoices/record-rule";

interface InvoiceAdminActionsProps {
  tenantId: string;
  tenantSlug: string;
  invoiceId: string;
  status: string;
  milestoneType: string;
  /** The recordPayments permission: may record a payment or cancel the invoice. */
  canRecordPayments: boolean;
  /** The approvePayments permission: recording over a slip waiting for review also needs it (it approves the slip). */
  canApprovePayments: boolean;
  /** Invoices MANAGE: may send the client a reminder. */
  canManage: boolean;
}

type Mode = null | "pay" | "void";

const btn = "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50";
const quiet = `${btn} border-zinc-700 text-zinc-200 hover:bg-zinc-800`;
const field =
  "w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500";

/** Record a payment, cancel the invoice, or remind the client. Shown above the invoice in the admin. */
export function InvoiceAdminActions({
  tenantId,
  tenantSlug,
  invoiceId,
  status,
  milestoneType,
  canRecordPayments,
  canApprovePayments,
  canManage,
}: InvoiceAdminActionsProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER" | "QR_CODE" | "CARD">("CASH");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unpaid = ["PENDING", "OVERDUE", "PENDING_VERIFICATION", "REJECTED"].includes(status);
  const remindable = ["PENDING", "OVERDUE", "REJECTED"].includes(status);
  if (!unpaid || (!canRecordPayments && !canManage)) return null;
  // A slip waiting for review: recording a payment would approve it, so it needs approvePayments as well.
  const canRecordHere = canRecordPaymentOn(status, { recordPayments: canRecordPayments, approvePayments: canApprovePayments });

  const ids = { tenantId, tenantSlug, invoiceId };
  const run = (fn: () => Promise<{ success: boolean; message?: string }>, done: string) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.success) {
        setError(res.message ?? "Something went wrong.");
        return;
      }
      toast.success(done);
      setMode(null);
      router.refresh();
    });

  return (
    <div className="w-full rounded-xl border border-zinc-800 bg-[#0d0d10] p-4 space-y-3 print:hidden">
      {mode === null && (
        <div className="flex flex-wrap items-center gap-2">
          {canRecordHere && (
            <button type="button" className={`${btn} border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10`} onClick={() => setMode("pay")}>
              <Banknote className="size-3.5" /> Record payment
            </button>
          )}
          {canRecordPayments && !canRecordHere && (
            <span className="text-[11px] text-zinc-500">A payment slip is waiting for review in Verification.</span>
          )}
          {remindable && canManage && (
            <button
              type="button"
              className={quiet}
              disabled={pending}
              onClick={() => run(() => sendInvoiceReminder(ids), "Reminder sent to the client.")}
            >
              <Bell className="size-3.5" /> Send reminder
            </button>
          )}
          {canRecordPayments && milestoneType !== "BOOKING_DEPOSIT" && (
            <button type="button" className={`${btn} border-red-500/40 text-red-300 hover:bg-red-500/10`} onClick={() => setMode("void")}>
              <Ban className="size-3.5" /> Cancel invoice
            </button>
          )}
          {!canRecordPayments && (
            <span className="text-[11px] text-zinc-500">Recording or cancelling a payment needs the record-payments permission.</span>
          )}
        </div>
      )}

      {mode === "pay" && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-300">Record money you received outside the app. The invoice is marked paid.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="space-y-1 block">
              <span className="text-[11px] text-zinc-400">Paid by</span>
              <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={field}>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="QR_CODE">QR / DuitNow</option>
                <option value="CARD">Card (studio terminal)</option>
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-[11px] text-zinc-400">Reference (optional)</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt or transfer no." className={field} />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" className={quiet} onClick={() => setMode(null)}>
              Back
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${btn} bg-emerald-500 border-emerald-500 text-black hover:bg-emerald-400`}
              onClick={() => run(() => recordInvoicePayment({ ...ids, method, reference: reference || undefined }), "Payment recorded.")}
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />} Mark as paid
            </button>
          </div>
        </div>
      )}

      {mode === "void" && (
        <div className="space-y-2">
          <label htmlFor="void-reason" className="text-xs text-zinc-300 block">
            Why is this invoice being cancelled?
          </label>
          <input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
          <div className="flex gap-2">
            <button type="button" className={quiet} onClick={() => setMode(null)}>
              Back
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${btn} bg-red-600 border-red-600 text-white hover:bg-red-500`}
              onClick={() => run(() => voidInvoice({ ...ids, reason }), "Invoice cancelled.")}
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />} Cancel invoice
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

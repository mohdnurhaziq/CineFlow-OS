"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  changeStudioPlan,
  closeStudio,
  extendTrial,
  getStudioPayments,
  pauseStudio,
  recordPlatformPayment,
  resumeStudio,
} from "@/lib/actions/super-admin";
import { PLANS, PLAN_CODES, asPlanCode, type PlanCode } from "@/lib/billing/plans";
import type { TenantSummaryItem } from "@/components/super-admin/super-admin-view";

type Payment = Awaited<ReturnType<typeof getStudioPayments>>[number];

const METHODS = [
  ["BANK_TRANSFER", "Bank transfer"],
  ["DUITNOW", "DuitNow"],
  ["CASH", "Cash"],
  ["OTHER", "Other"],
] as const;

const field = "w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500";
const label = "block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1";
const btn = "px-3 py-2 rounded-lg text-xs font-mono font-semibold min-h-10 transition-colors disabled:opacity-50";

/** One studio's plan: change it, record a payment, extend the trial, pause, or close. A panel over the console. */
export function ManageStudioPanel({ studio, onClose }: { studio: TenantSummaryItem; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);

  const [plan, setPlan] = useState<PlanCode>(asPlanCode(studio.subscriptionTier));
  const [amount, setAmount] = useState(String(PLANS[asPlanCode(studio.subscriptionTier)].priceMyr));
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [paidUntil, setPaidUntil] = useState("");
  const [note, setNote] = useState("");
  const [trialUntil, setTrialUntil] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");

  const loadPayments = () => getStudioPayments(studio.id).then(setPayments).catch(() => setPayments([]));
  useEffect(() => {
    void loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = (job: () => Promise<{ success: boolean; message?: string }>, done?: () => void) =>
    start(async () => {
      const res = await job();
      setNotice({ ok: res.success, text: res.message ?? (res.success ? "Saved." : "That didn't work.") });
      if (res.success) {
        done?.();
        void loadPayments();
        router.refresh();
      }
    });

  const paused = studio.state === "PAUSED";
  const manuallyPaused = !!studio.pausedAt && studio.pauseReason === "MANUAL";

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/80 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="manage-title" className="relative w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#0d0d10] shadow-2xl my-auto">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800">
          <div className="min-w-0">
            <h2 id="manage-title" className="text-base font-bold text-white truncate">{studio.name}</h2>
            <p className="text-xs text-zinc-400 font-mono truncate">{studio.slug} · {PLANS[asPlanCode(studio.subscriptionTier)].name} plan</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {notice && (
            <div role="status" className={`rounded-lg px-3 py-2 text-xs ${notice.ok ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30" : "bg-red-500/10 text-red-300 border border-red-500/30"}`}>
              {notice.text}
            </div>
          )}

          <section aria-labelledby="pay-h" className="space-y-3">
            <h3 id="pay-h" className="text-sm font-semibold text-white">Record a payment</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pay-plan" className={label}>Plan</label>
                <select id="pay-plan" value={plan} onChange={(e) => { const p = e.target.value as PlanCode; setPlan(p); setAmount(String(PLANS[p].priceMyr)); }} className={field}>
                  {PLAN_CODES.map((c) => <option key={c} value={c}>{PLANS[c].name} (RM {PLANS[c].priceMyr}/mo)</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="pay-amount" className={label}>Amount (RM)</label>
                <input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
              </div>
              <div>
                <label htmlFor="pay-method" className={label}>How they paid</label>
                <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={field}>
                  {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="pay-until" className={label}>Paid until</label>
                <input id="pay-until" type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} className={field} />
              </div>
              <div>
                <label htmlFor="pay-ref" className={label}>Reference (optional)</label>
                <input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} className={field} />
              </div>
              <div>
                <label htmlFor="pay-note" className={label}>Note (optional)</label>
                <input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} className={field} />
              </div>
            </div>
            <button
              type="button"
              disabled={pending || !paidUntil || !amount}
              onClick={() => run(() => recordPlatformPayment({ tenantId: studio.id, amount: Number(amount), method, reference, plan, paidUntil, note }), () => { setReference(""); setNote(""); })}
              className={`${btn} bg-amber-500 text-black hover:bg-amber-400`}
            >
              Record payment
            </button>
            <p className="text-[11px] text-zinc-500">Sets the plan, and moves &ldquo;paid until&rdquo; to that day if it&apos;s later than today&apos;s.</p>
          </section>

          <section aria-labelledby="hist-h" className="space-y-2">
            <h3 id="hist-h" className="text-sm font-semibold text-white">Payments</h3>
            {payments === null ? (
              <p className="text-xs text-zinc-400">Loading…</p>
            ) : payments.length === 0 ? (
              <p className="text-xs text-zinc-400">None recorded yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 text-xs">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
                    <span className="font-mono text-white">RM {p.amount.toFixed(2)}</span>
                    <span className="text-zinc-300">{PLANS[asPlanCode(p.plan)].name} · until {new Date(p.paidUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" })}</span>
                    <span className="text-zinc-500">{METHODS.find((m) => m[0] === p.method)?.[1]}{p.reference ? ` · ${p.reference}` : ""} · {new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="plan-h" className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 id="plan-h" className="text-sm font-semibold text-white">Change plan only</h3>
              <button type="button" disabled={pending || plan === asPlanCode(studio.subscriptionTier)} onClick={() => run(() => changeStudioPlan({ tenantId: studio.id, plan }))} className={`${btn} bg-zinc-800 text-white hover:bg-zinc-700`}>
                Switch to {PLANS[plan].name}
              </button>
              <p className="text-[11px] text-zinc-500">Uses the plan chosen above, with no payment.</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-white">Free trial</h3>
              <label htmlFor="trial-until" className={label}>Trial ends on</label>
              <input id="trial-until" type="date" value={trialUntil} onChange={(e) => setTrialUntil(e.target.value)} className={field} />
              <button type="button" disabled={pending || !trialUntil} onClick={() => run(() => extendTrial({ tenantId: studio.id, until: trialUntil }))} className={`${btn} bg-zinc-800 text-white hover:bg-zinc-700`}>
                Set trial end
              </button>
            </div>
          </section>

          <section aria-labelledby="status-h" className="space-y-2 border-t border-zinc-800 pt-4">
            <h3 id="status-h" className="text-sm font-semibold text-white">Pause or close</h3>
            <div className="flex flex-wrap gap-2">
              {manuallyPaused ? (
                <button type="button" disabled={pending} onClick={() => run(() => resumeStudio({ tenantId: studio.id }))} className={`${btn} bg-emerald-500 text-black hover:bg-emerald-400`}>
                  Resume studio
                </button>
              ) : (
                <button type="button" disabled={pending || paused || studio.state === "CLOSED"} onClick={() => run(() => pauseStudio({ tenantId: studio.id }))} className={`${btn} bg-zinc-800 text-white hover:bg-zinc-700`}>
                  Pause studio
                </button>
              )}
            </div>
            <p className="text-[11px] text-zinc-500">Paused studios cannot change anything and take no new online bookings; clients keep their galleries and can still pay.</p>
            <div className="pt-2 space-y-2">
              <label htmlFor="close-slug" className={label}>Close the studio: type its address ({studio.slug})</label>
              <div className="flex gap-2">
                <input id="close-slug" value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} className={field} autoComplete="off" />
                <button type="button" disabled={pending || confirmSlug.trim() !== studio.slug} onClick={() => run(() => closeStudio({ tenantId: studio.id, confirmSlug }), onClose)} className={`${btn} bg-red-600 text-white hover:bg-red-500 shrink-0`}>
                  Close studio
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">Its website and admin stop opening. Nothing is deleted.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

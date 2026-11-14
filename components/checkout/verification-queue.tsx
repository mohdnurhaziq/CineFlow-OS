"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, CheckCircle2, Eye, Loader2, MessageSquare, XCircle } from "lucide-react";
import { milestoneLabel, paymentMethodLabel } from "@/lib/labels";
import { formatSlotDate, STUDIO_TIME_ZONE } from "@/lib/slot-time";
import type { AdminVerificationConsoleProps } from "./admin-verification-console";

export type PendingItem = AdminVerificationConsoleProps["pendingInvoices"][number];

interface VerificationQueueProps {
  /** Pending payments in the current tab/search, any order (shown oldest first). */
  items: PendingItem[];
  tenantSlug: string;
  currencySymbol: string;
  isOwner: boolean;
  isPending: boolean;
  categoryName: (slug: string) => string;
  onApprove: (item: PendingItem) => void;
  onReject: (item: PendingItem) => void;
  onZoom: (item: PendingItem) => void;
}

const money = (symbol: string, n: number) => `${symbol}${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

// Studio time zone, so the server (UTC) and the browser render the same text.
const submittedAt = (d: Date | string) =>
  new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: STUDIO_TIME_ZONE });

/** `short` is for the list rows ("QR", "Cash"), where the full label crowds out the tracking code. */
function MethodBadge({ method, short = false }: { method: string | null; short?: boolean }) {
  const cls =
    method === "QR_CODE"
      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
      : method === "CASH"
        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        : "bg-zinc-800 text-zinc-300 border-zinc-700";
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border whitespace-nowrap ${cls}`}>
      {short && method === "QR_CODE" ? "QR" : short && method === "CASH" ? "Cash" : method ? paymentMethodLabel(method) : "Not chosen"}
    </span>
  );
}

/**
 * The pending-payments queue: a compact list (oldest first) beside one payment under review.
 * After Approve or Reject the server refreshes the list; the payment drops out and the one that
 * moved into its place is shown, so a backlog can be cleared without scrolling back.
 * On narrow screens the list and the review take turns.
 */
export function VerificationQueue({
  items,
  tenantSlug,
  currencySymbol,
  isOwner,
  isPending,
  categoryName,
  onApprove,
  onReject,
  onZoom,
}: VerificationQueueProps) {
  const queue = useMemo(
    () => [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [items],
  );
  const [selectedId, setSelectedId] = useState<string | null>(queue[0]?.id ?? null);
  // Narrow screens: show the review instead of the list once a payment is tapped.
  const [reviewOpen, setReviewOpen] = useState(false);
  const lastIndex = useRef(0);
  const reviewRef = useRef<HTMLElement>(null);

  const index = queue.findIndex((i) => i.id === selectedId);
  if (index >= 0) lastIndex.current = index;

  // The reviewed payment left the list (approved, rejected, or filtered out): take the one now in its place.
  useEffect(() => {
    if (queue.length === 0) {
      setSelectedId(null);
      setReviewOpen(false);
    } else if (!queue.some((i) => i.id === selectedId)) {
      setSelectedId(queue[Math.min(lastIndex.current, queue.length - 1)]!.id);
    }
  }, [queue, selectedId]);

  // Narrow screens: bring the review's top into view when it opens or moves on to the next payment
  // (the list may have been scrolled far down). scroll-mt keeps it clear of the sticky admin header.
  useEffect(() => {
    if (reviewOpen && window.matchMedia("(max-width: 1023px)").matches) {
      reviewRef.current?.scrollIntoView({ block: "start" });
    }
  }, [reviewOpen, selectedId]);

  const selected = queue.find((i) => i.id === selectedId) ?? null;
  const position = selected ? queue.indexOf(selected) + 1 : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      {/* List */}
      <div className={`${reviewOpen ? "hidden lg:block" : "block"} rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden`}>
        <div className="px-4 py-2.5 border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          Waiting ({queue.length}) · oldest first
        </div>
        <ul className="divide-y divide-zinc-800/70 lg:max-h-[70vh] lg:overflow-y-auto" aria-label="Payments waiting for verification">
          {queue.map((item) => {
            const active = item.id === selectedId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setReviewOpen(true);
                  }}
                  aria-current={active ? "true" : undefined}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors focus-visible:outline-none focus-visible:bg-zinc-800/60 ${
                    active ? "bg-amber-500/10 lg:border-l-2 lg:border-amber-500" : "hover:bg-zinc-900/60"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white truncate">{item.client.name}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 min-w-0">
                      <span className="truncate">{item.booking?.trackingCode ?? item.invoiceNumber}</span>
                      <span aria-hidden="true">·</span>
                      <span className="whitespace-nowrap">{milestoneLabel(item.milestoneType)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    <div className="text-xs font-bold font-mono tabular-nums text-amber-400">
                      {money(currencySymbol, item.amount)}
                    </div>
                    <MethodBadge method={item.paymentMethod} short />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Review */}
      {selected && (
        <section
          ref={reviewRef}
          aria-label={`Review payment ${selected.invoiceNumber}`}
          className={`${reviewOpen ? "block" : "hidden lg:block"} scroll-mt-60 rounded-2xl border border-zinc-800 bg-[#121215] p-5 space-y-5 lg:sticky lg:top-40`}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setReviewOpen(false)}
              className="lg:hidden inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" /> All payments
            </button>
            <span className="ml-auto text-[11px] font-mono text-zinc-500">
              {position} of {queue.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="font-bold text-white">{selected.invoiceNumber}</span>
            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {milestoneLabel(selected.milestoneType)}
            </span>
            <MethodBadge method={selected.paymentMethod} />
            <span className="text-zinc-500 text-[11px] sm:ml-auto">{submittedAt(selected.createdAt)}</span>
          </div>

          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-4 text-xs min-w-0">
              <div className="space-y-1">
                <div className="text-[10px] font-mono uppercase text-zinc-500">Client</div>
                <div className="text-base font-semibold text-white break-words">{selected.client.name}</div>
                <div className="text-zinc-400 text-[11px] font-mono break-all">
                  {selected.client.email}
                  {selected.client.phone ? ` · ${selected.client.phone}` : ""}
                </div>
                {selected.client.phone && (
                  <a
                    href={`https://wa.me/${selected.client.phone.replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 hover:text-emerald-300 hover:underline"
                  >
                    <MessageSquare className="size-3" aria-hidden="true" /> WhatsApp client
                  </a>
                )}
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-mono uppercase text-zinc-500">
                  {selected.project ? "Linked project" : "Booking"}
                </div>
                {selected.booking ? (
                  <>
                    <div className="font-semibold text-amber-400 font-mono">
                      <Link
                        href={`/${tenantSlug}/admin/bookings/${selected.booking.id}`}
                        className="underline decoration-amber-500/40 underline-offset-2 hover:decoration-amber-400"
                        title="Open this booking's full details"
                      >
                        {selected.booking.trackingCode}
                      </Link>{" "}
                      · {categoryName(selected.booking.category)}
                    </div>
                    <div className="text-zinc-400 text-[11px] font-mono">
                      {[
                        selected.booking.slot?.date
                          ? formatSlotDate(selected.booking.slot.date, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : selected.booking.targetDate,
                        selected.booking.slot ? `${selected.booking.slot.startTime} – ${selected.booking.slot.endTime}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </>
                ) : selected.project ? (
                  <>
                    <div className="font-semibold text-white break-words">{selected.project.title}</div>
                    <div className="text-zinc-400 text-[11px] font-mono">#{selected.project.projectNumber}</div>
                  </>
                ) : (
                  <div className="text-zinc-400 text-[11px]">Direct studio milestone</div>
                )}
              </div>

              {selected.paymentReference && (
                <div className="text-[11px] font-mono text-zinc-400 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/80 break-words">
                  <span className="text-zinc-500 uppercase">Payment note / ref: </span>
                  <span className="text-white font-medium">{selected.paymentReference}</span>
                </div>
              )}
            </div>

            {/* Receipt */}
            <div className="sm:w-44">
              {selected.paymentProofUrl ? (
                <button
                  type="button"
                  onClick={() => onZoom(selected)}
                  className="group relative block w-full aspect-[3/4] max-h-72 rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900 hover:border-amber-500 transition-colors"
                  title="Zoom receipt"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selected.paymentProofUrl} alt={`Receipt for ${selected.invoiceNumber}`} className="size-full object-contain" />
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/70 py-1 text-[10px] font-mono text-amber-400">
                    <Eye className="size-3" aria-hidden="true" /> Zoom receipt
                  </span>
                </button>
              ) : selected.paymentMethod === "CASH" ? (
                <div className="w-full aspect-[3/4] max-h-72 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 flex flex-col items-center justify-center p-3 text-center">
                  <Banknote className="size-7 text-emerald-400" aria-hidden="true" />
                  <span className="text-[11px] text-zinc-400 mt-1.5">Paid at the cash desk. Check your till.</span>
                </div>
              ) : (
                <div className="w-full rounded-xl border border-dashed border-zinc-700 p-3 text-[11px] text-zinc-500 text-center">
                  No receipt attached
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-zinc-800 pt-4">
            <div>
              <div className="text-[10px] font-mono uppercase text-zinc-500">Amount due</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-amber-400">
                {money(currencySymbol, selected.amount)}
              </div>
            </div>
            {!isOwner ? (
              <p className="text-[11px] text-zinc-500 sm:max-w-[14rem] sm:text-right">
                Only the studio owner can approve or reject payments.
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onReject(selected)}
                  className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-red-950/40 border border-zinc-800 hover:border-red-500/50 text-zinc-300 hover:text-red-400 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <XCircle className="size-3.5" aria-hidden="true" /> Reject
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onApprove(selected)}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  )}
                  {queue.length > 1 ? "Approve & next" : "Approve"}
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

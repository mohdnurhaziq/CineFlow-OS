"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Receipt, Search, Inbox } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  type: string;
  typeLabel: string;
  /** PENDING, OVERDUE, PENDING_VERIFICATION, PAID, REJECTED, VOID */
  status: string;
  amount: number;
  clientName: string;
  clientEmail: string;
  /** Package and booking code, or project title and number. */
  reference: string | null;
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
}

type FilterId = "all" | "unpaid" | "review" | "paid" | "closed";

const FILTERS: { id: FilterId; label: string; statuses: string[] | null }[] = [
  { id: "all", label: "All", statuses: null },
  { id: "unpaid", label: "Unpaid", statuses: ["PENDING", "OVERDUE"] },
  { id: "review", label: "Under review", statuses: ["PENDING_VERIFICATION"] },
  { id: "paid", label: "Paid", statuses: ["PAID"] },
  { id: "closed", label: "Cancelled / rejected", statuses: ["VOID", "REJECTED"] },
];

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Unpaid", className: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
  OVERDUE: { label: "Overdue", className: "bg-red-500/10 text-red-400 border-red-500/25" },
  PENDING_VERIFICATION: { label: "Under review", className: "bg-blue-500/10 text-blue-400 border-blue-500/25" },
  PAID: { label: "Paid", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" },
  REJECTED: { label: "Rejected", className: "bg-red-500/10 text-red-400 border-red-500/25" },
  VOID: { label: "Cancelled", className: "bg-zinc-800 text-zinc-400 border-zinc-700" },
};

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const COLS = "md:grid-cols-[1.1fr_1.4fr_1.6fr_0.9fr_0.9fr_9rem]";

export function InvoicesConsole({ tenantSlug, currency, invoices }: { tenantSlug: string; currency: string; invoices: InvoiceRow[] }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [type, setType] = useState<string>("all");
  const [query, setQuery] = useState("");

  const types = useMemo(() => {
    const seen = new Map<string, string>();
    for (const inv of invoices) seen.set(inv.type, inv.typeLabel);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [invoices]);

  const money = (n: number) => formatCurrency(n, currency);
  const sum = (statuses: string[]) => invoices.filter((i) => statuses.includes(i.status)).reduce((t, i) => t + i.amount, 0);
  const totals = {
    outstanding: sum(["PENDING", "OVERDUE"]),
    review: sum(["PENDING_VERIFICATION"]),
    collected: sum(["PAID"]),
  };

  const counts = useMemo(() => {
    const c = {} as Record<FilterId, number>;
    for (const f of FILTERS) c[f.id] = f.statuses ? invoices.filter((i) => f.statuses!.includes(i.status)).length : invoices.length;
    return c;
  }, [invoices]);

  const visible = useMemo(() => {
    const statuses = FILTERS.find((f) => f.id === filter)?.statuses;
    const q = query.trim().toLowerCase();
    return invoices.filter(
      (i) =>
        (!statuses || statuses.includes(i.status)) &&
        (type === "all" || i.type === type) &&
        (!q || [i.invoiceNumber, i.clientName, i.clientEmail, i.reference ?? ""].some((v) => v.toLowerCase().includes(q)))
    );
  }, [invoices, filter, type, query]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
          <Receipt className="size-6 text-amber-400" />
          Invoices
        </h1>
        <p className="text-xs text-zinc-400">Every invoice the studio has issued. Open one to view, print or save it as a PDF.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Outstanding", value: totals.outstanding, tone: "text-amber-400" },
          { label: "Under review", value: totals.review, tone: "text-blue-400" },
          { label: "Collected", value: totals.collected, tone: "text-emerald-400" },
        ].map((t) => (
          <div key={t.label} className="p-4 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t.label}</div>
            <div className={`mt-1 text-xl font-bold font-mono tabular-nums ${t.tone}`}>{money(t.value)}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter invoices by status" className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border whitespace-nowrap transition-colors ${
                  active
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border-zinc-800"
                }`}
              >
                {f.label}
                <span
                  className={`px-1.5 rounded-full text-[10px] tabular-nums ${
                    f.id === "review" && counts.review > 0 ? "bg-blue-500 text-white" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {counts[f.id]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <label className="block">
            <span className="sr-only">Invoice type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full sm:w-52 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="all">All types</option>
              {types.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="relative block sm:w-64">
            <span className="sr-only">Search invoices</span>
            <Search className="size-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Number, client, booking or project"
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] overflow-hidden">
        <div className={`hidden md:grid ${COLS} gap-4 px-5 py-2.5 border-b border-zinc-800 text-[10px] font-mono uppercase tracking-widest text-zinc-500`}>
          <span>Invoice</span>
          <span>Client</span>
          <span>For</span>
          <span>Due / paid</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Status</span>
        </div>

        {visible.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-2">
            <Inbox className="size-8 text-zinc-600 mx-auto" />
            <p className="text-sm text-zinc-300">{query || type !== "all" ? "No invoices match." : "No invoices here yet."}</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/70">
            {visible.map((inv) => {
              const style = STATUS_STYLE[inv.status] ?? { label: inv.status, className: "bg-zinc-800 text-zinc-400 border-zinc-700" };
              return (
                <li key={inv.id}>
                  <Link
                    href={`/${tenantSlug}/admin/invoices/${inv.id}`}
                    className={`grid grid-cols-[1fr_auto] ${COLS} gap-x-4 gap-y-1 px-5 py-3.5 items-center hover:bg-zinc-900/60 focus-visible:bg-zinc-900/60 focus-visible:outline-none transition-colors`}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-mono text-white">{inv.invoiceNumber}</span>
                      <span className="block text-[11px] text-zinc-500">Issued {day(inv.issuedAt)}</span>
                    </span>
                    <span className="md:hidden justify-self-end">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${style.className}`}>{style.label}</span>
                    </span>
                    <span className="min-w-0 col-span-2 md:col-span-1">
                      <span className="block text-xs text-zinc-200 truncate">{inv.clientName}</span>
                      <span className="block text-[11px] text-zinc-500 truncate">{inv.clientEmail}</span>
                    </span>
                    <span className="min-w-0 col-span-2 md:col-span-1">
                      <span className="block text-xs text-zinc-300">{inv.typeLabel}</span>
                      {inv.reference && <span className="block text-[11px] text-zinc-500 truncate">{inv.reference}</span>}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {inv.status === "PAID" && inv.paidAt ? `Paid ${day(inv.paidAt)}` : `Due ${day(inv.dueDate)}`}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-white md:text-right">{money(inv.amount)}</span>
                    <span className="hidden md:block justify-self-end">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-mono border whitespace-nowrap ${style.className}`}>
                        {style.label}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

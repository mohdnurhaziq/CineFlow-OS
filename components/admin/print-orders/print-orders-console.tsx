"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Frame, Inbox, Search } from "lucide-react";
import { chipClass, chipCountClass, chipListClass } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page";
import { formatStudioDate } from "@/lib/slot-time";
import { PRINT_ORDER_STATUS_STYLES, printOrderStatusLabel } from "@/lib/prints/status";
import { studioPath } from "@/lib/domain-name";
import { formatMoney } from "@/lib/money";

export interface PrintOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  fulfilment: string;
  totalAmount: number;
  clientName: string;
  clientEmail: string;
  projectTitle: string;
  itemCount: number;
  /** Gallery previews of the first few prints (never the masters). */
  thumbnails: string[];
  createdAt: string;
}

type FilterId = "all" | "new" | "production" | "out" | "done" | "awaiting" | "cancelled";

const FILTERS: { id: FilterId; label: string; statuses: string[] | null }[] = [
  { id: "all", label: "All", statuses: null },
  { id: "new", label: "New", statuses: ["NEW"] },
  { id: "production", label: "In production", statuses: ["IN_PRODUCTION"] },
  { id: "out", label: "Ready / shipped", statuses: ["READY_FOR_PICKUP", "SHIPPED"] },
  { id: "done", label: "Collected / delivered", statuses: ["COLLECTED", "DELIVERED"] },
  { id: "awaiting", label: "Awaiting payment", statuses: ["AWAITING_PAYMENT"] },
  { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
];

const COLS = "md:grid-cols-[1.1fr_1.4fr_1.4fr_0.8fr_0.8fr_9rem]";

export function PrintOrdersConsole({ tenantSlug, currency, orders }: { tenantSlug: string; currency: string; orders: PrintOrderRow[] }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c = {} as Record<FilterId, number>;
    for (const f of FILTERS) c[f.id] = f.statuses ? orders.filter((o) => f.statuses!.includes(o.status)).length : orders.length;
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    const statuses = FILTERS.find((f) => f.id === filter)?.statuses;
    const q = query.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (!statuses || statuses.includes(o.status)) &&
        (!q || [o.orderNumber, o.clientName, o.clientEmail, o.projectTitle].some((v) => v.toLowerCase().includes(q)))
    );
  }, [orders, filter, query]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Frame}
        title="Print orders"
        description="Framed prints clients have ordered from their galleries. Open one to download the photos, update its status or add tracking."
      />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter print orders by status" className={chipListClass}>
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button key={f.id} type="button" role="tab" aria-selected={active} onClick={() => setFilter(f.id)} className={chipClass(active)}>
                {f.label}
                <span className={chipCountClass(active, f.id === "new" && counts.new > 0)}>{counts[f.id]}</span>
              </button>
            );
          })}
        </div>
        <label className="relative block sm:w-64">
          <span className="sr-only">Search print orders</span>
          <Search className="size-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Order, client or gallery"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-amber-500"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] overflow-hidden">
        <div className={`hidden md:grid ${COLS} gap-4 px-5 py-2.5 border-b border-zinc-800 text-[11px] font-mono uppercase tracking-widest text-zinc-400`}>
          <span>Order</span>
          <span>Client</span>
          <span>Prints</span>
          <span>Fulfilment</span>
          <span className="text-right">Total</span>
          <span className="text-right">Status</span>
        </div>

        {visible.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-2">
            <Inbox className="size-8 text-zinc-400 mx-auto" />
            <p className="text-sm text-zinc-300">{query ? "No print orders match." : "No print orders here yet."}</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/70">
            {visible.map((o) => {
              const badge = (
                <span
                  className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-mono border whitespace-nowrap ${PRINT_ORDER_STATUS_STYLES[o.status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
                >
                  {printOrderStatusLabel(o.status)}
                </span>
              );
              return (
                <li key={o.id}>
                  <Link
                    href={studioPath(tenantSlug, `/admin/print-orders/${o.id}`)}
                    className={`grid grid-cols-[1fr_auto] ${COLS} gap-x-4 gap-y-1.5 px-5 py-3.5 items-center hover:bg-zinc-900/60 focus-visible:bg-zinc-900/60 focus-visible:outline-none transition-colors`}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-mono text-white">{o.orderNumber}</span>
                      <span className="block text-[11px] text-zinc-400">Placed {formatStudioDate(o.createdAt)}</span>
                    </span>
                    <span className="md:hidden justify-self-end">{badge}</span>
                    <span className="min-w-0 col-span-2 md:col-span-1">
                      <span className="block text-xs text-zinc-200 truncate">{o.clientName}</span>
                      <span className="block text-[11px] text-zinc-400 truncate">{o.projectTitle}</span>
                    </span>
                    <span className="flex items-center gap-2 min-w-0 col-span-2 md:col-span-1">
                      <span className="flex -space-x-2 shrink-0">
                        {o.thumbnails.map((src, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={src} alt="" className="size-8 rounded-md object-cover border-2 border-[#0d0d10] bg-zinc-900" />
                        ))}
                      </span>
                      <span className="text-xs text-zinc-300">
                        {o.itemCount} print{o.itemCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="text-[11px] text-zinc-400">{o.fulfilment === "SHIP" ? "Delivery" : "Pickup"}</span>
                    <span className="text-xs font-mono tabular-nums text-white md:text-right">{formatMoney(currency, o.totalAmount)}</span>
                    <span className="hidden md:block justify-self-end">{badge}</span>
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

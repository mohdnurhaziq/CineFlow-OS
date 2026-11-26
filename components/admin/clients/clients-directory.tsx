"use client";

import { chipClass, chipCountClass, chipListClass } from "@/components/ui/tabs";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users, ChevronRight, Download, ExternalLink, Eye } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { toCsv } from "@/lib/csv";
import { CLIENT_ACCOUNT_STATUS_LABELS } from "@/lib/client-directory-labels";
import type { ClientDirectoryRow } from "@/lib/client-directory";
import type { ClientAccountStatus } from "@/lib/client-directory-labels";
import { ClientAccountBadge } from "@/components/admin/clients/client-account-badge";
import { ClientDetailsDialog } from "@/components/admin/clients/client-details-dialog";
import { studioPath } from "@/lib/domain-name";
import { studioDateKey } from "@/lib/slot-time";

type Filter = "ALL" | ClientAccountStatus | "OWING";

interface ClientsDirectoryProps {
  tenantId: string;
  tenantSlug: string;
  currency: string;
  clients: ClientDirectoryRow[];
  /** Invoices VIEW: the Paid and Balance due columns and filter (the server leaves the figures out otherwise). */
  showMoney: boolean;
  initialFilter?: Filter;
  initialQuery?: string;
}

const GRID_WITH_MONEY = "md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_5rem_5rem_minmax(0,1fr)_minmax(0,1fr)_7rem_5.5rem]";
const GRID_NO_MONEY = "md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_5rem_5rem_7rem_5.5rem]";

export function ClientsDirectory({
  tenantId,
  tenantSlug,
  currency,
  clients,
  showMoney,
  initialFilter,
  initialQuery,
}: ClientsDirectoryProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [filter, setFilter] = useState<Filter>(initialFilter ?? "ALL");
  const [selectedClient, setSelectedClient] = useState<ClientDirectoryRow | null>(null);

  const counts = useMemo(
    () => ({
      ALL: clients.length,
      REGISTERED: clients.filter((c) => c.accountStatus === "REGISTERED").length,
      INVITED: clients.filter((c) => c.accountStatus === "INVITED").length,
      GUEST: clients.filter((c) => c.accountStatus === "GUEST").length,
      OWING: clients.filter((c) => (c.outstanding ?? 0) > 0).length,
    }),
    [clients]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/[^0-9]/g, "");
    return clients.filter((c) => {
      if (filter === "OWING" ? (c.outstanding ?? 0) <= 0 : filter !== "ALL" && c.accountStatus !== filter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (digits.length >= 3 && (c.phone ?? "").replace(/[^0-9]/g, "").includes(digits))
      );
    });
  }, [clients, query, filter]);

  /** Downloads the clients currently shown (search and filter applied) as a CSV file. */
  function exportCsv() {
    const csv = toCsv(
      [
        "Name",
        "Email",
        "Phone",
        "Account",
        "Bookings",
        "Projects",
        ...(showMoney ? [`Paid (${currency})`, `Balance due (${currency})`] : []),
        "Last active",
        "Client since",
      ],
      visible.map((c) => [
        c.name,
        c.email,
        c.phone,
        CLIENT_ACCOUNT_STATUS_LABELS[c.accountStatus],
        c.bookingCount,
        c.projectCount,
        ...(showMoney ? [(c.paid ?? 0).toFixed(2), (c.outstanding ?? 0).toFixed(2)] : []),
        c.lastActivityDate,
        c.clientSinceDate,
      ])
    );
    // BOM so Excel reads the file as UTF-8 (names with accents).
    const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tenantSlug}-clients-${studioDateKey()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "ALL", label: "All" },
    { id: "REGISTERED", label: "Registered" },
    { id: "INVITED", label: "Invited" },
    { id: "GUEST", label: "Guest" },
    ...(showMoney ? [{ id: "OWING" as const, label: "Balance due" }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Clients"
        description={
          showMoney
            ? "Everyone with an account at your studio, with their bookings, galleries and balance."
            : "Everyone with an account at your studio, with their bookings and galleries."
        }
        actions={
          <label className="relative w-full sm:w-80">
            <span className="sr-only">Search clients</span>
            <Search className="size-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email or phone"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
            />
          </label>
        }
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className={chipListClass} role="group" aria-label="Filter clients">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={chipClass(filter === f.id)}
            >
              {f.label}
              <span className={chipCountClass(filter === f.id)}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={visible.length === 0}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Download className="size-3.5 text-amber-400" aria-hidden="true" />
          Export CSV
          <span className="text-[10px] text-zinc-500">{visible.length}</span>
        </button>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center space-y-2">
          <Users className="size-8 text-zinc-600 mx-auto" aria-hidden="true" />
          <p className="text-sm font-semibold text-white">No clients yet</p>
          <p className="text-xs text-zinc-400">Clients appear here once they book or create an account.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-xs text-zinc-400 space-y-2">
          <p>No clients match this search or filter.</p>
          {filter !== "ALL" && (
            <button
              type="button"
              onClick={() => setFilter("ALL")}
              className="text-xs font-mono text-amber-400 hover:underline inline-flex items-center gap-1"
            >
              Reset filter to &quot;All&quot; ({clients.length})
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden">
          <div
            className={cn(
              "hidden md:grid gap-4 px-4 py-2.5 border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500",
              showMoney ? GRID_WITH_MONEY : GRID_NO_MONEY
            )}
          >
            <span>Client</span>
            <span>Phone</span>
            <span className="text-right">Bookings</span>
            <span className="text-right">Galleries</span>
            {showMoney && <span className="text-right">Paid</span>}
            {showMoney && <span className="text-right">Balance due</span>}
            <span className="text-right">Last active</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-zinc-800/80">
            {visible.map((c) => (
              <li key={c.id}>
                <div
                  onClick={() => setSelectedClient(c)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedClient(c);
                    }
                  }}
                  className={cn(
                    "group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-center px-4 py-3 hover:bg-zinc-800/40 focus-visible:bg-zinc-800/40 outline-none transition-colors cursor-pointer",
                    showMoney ? GRID_WITH_MONEY : GRID_NO_MONEY
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-white truncate group-hover:text-amber-400 transition-colors">
                        {c.name}
                      </span>
                      <ClientAccountBadge status={c.accountStatus} />
                    </div>
                    <div className="text-xs text-zinc-400 truncate">{c.email}</div>
                  </div>

                  <span className="hidden md:block text-xs font-mono text-zinc-300 truncate">{c.phone || "—"}</span>
                  <span className="hidden md:block text-xs font-mono text-zinc-300 text-right tabular-nums">{c.bookingCount}</span>
                  <span className="hidden md:block text-xs font-mono text-zinc-300 text-right tabular-nums">{c.projectCount}</span>
                  {showMoney && (
                    <span className="hidden md:block text-xs font-mono text-zinc-300 text-right tabular-nums">
                      {formatMoney(currency, c.paid ?? 0)}
                    </span>
                  )}
                  {showMoney && (
                    <span
                      className={cn(
                        "hidden md:block text-xs font-mono text-right tabular-nums",
                        (c.outstanding ?? 0) > 0 ? "text-amber-400 font-semibold" : "text-zinc-500"
                      )}
                    >
                      {(c.outstanding ?? 0) > 0 ? formatMoney(currency, c.outstanding ?? 0) : "—"}
                    </span>
                  )}
                  <span className="hidden md:block text-xs font-mono text-zinc-400 text-right">{c.lastActivityLabel}</span>

                  {/* Actions column */}
                  <div className="flex items-center gap-1.5 justify-self-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClient(c);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono text-amber-400 hover:text-white bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-colors"
                      title="View client quick details"
                    >
                      <Eye className="size-3" />
                      <span>Details</span>
                    </button>
                    <Link
                      href={studioPath(tenantSlug, `/admin/clients/${c.id}`)}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                      title="Open full client record"
                    >
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Link>
                  </div>

                  {/* Mobile responsive summary line */}
                  <div className="md:hidden col-span-2 pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-zinc-400 border-t border-zinc-800/40 mt-1">
                    {c.phone && <span className="text-zinc-300">📞 {c.phone}</span>}
                    <span>{c.bookingCount} {c.bookingCount === 1 ? "booking" : "bookings"}</span>
                    <span>{c.projectCount} {c.projectCount === 1 ? "gallery" : "galleries"}</span>
                    {showMoney && (c.outstanding ?? 0) > 0 && (
                      <span className="text-amber-400 font-semibold">{formatMoney(currency, c.outstanding ?? 0)} due</span>
                    )}
                    <span className="text-zinc-500">Active: {c.lastActivityLabel}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick Details Modal Dialog */}
      <ClientDetailsDialog
        isOpen={selectedClient !== null}
        onClose={() => setSelectedClient(null)}
        clientRow={selectedClient}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        currency={currency}
        showMoney={showMoney}
      />
    </div>
  );
}

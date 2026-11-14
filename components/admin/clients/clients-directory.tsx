"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users, ChevronRight, Download } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { toCsv } from "@/lib/csv";
import { CLIENT_ACCOUNT_STATUS_LABELS } from "@/lib/client-directory-labels";
import type { ClientDirectoryRow } from "@/lib/client-directory";
import type { ClientAccountStatus } from "@/lib/client-directory-labels";
import { ClientAccountBadge } from "@/components/admin/clients/client-account-badge";

type Filter = "ALL" | ClientAccountStatus | "OWING";

interface ClientsDirectoryProps {
  tenantSlug: string;
  currency: string;
  clients: ClientDirectoryRow[];
}

export function ClientsDirectory({ tenantSlug, currency, clients }: ClientsDirectoryProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  const counts = useMemo(
    () => ({
      ALL: clients.length,
      REGISTERED: clients.filter((c) => c.accountStatus === "REGISTERED").length,
      INVITED: clients.filter((c) => c.accountStatus === "INVITED").length,
      GUEST: clients.filter((c) => c.accountStatus === "GUEST").length,
      OWING: clients.filter((c) => c.outstanding > 0).length,
    }),
    [clients]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/[^0-9]/g, "");
    return clients.filter((c) => {
      if (filter === "OWING" ? c.outstanding <= 0 : filter !== "ALL" && c.accountStatus !== filter) return false;
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
      ["Name", "Email", "Phone", "Account", "Bookings", "Projects", `Paid (${currency})`, `Balance due (${currency})`, "Last active", "Client since"],
      visible.map((c) => [
        c.name,
        c.email,
        c.phone,
        CLIENT_ACCOUNT_STATUS_LABELS[c.accountStatus],
        c.bookingCount,
        c.projectCount,
        c.paid.toFixed(2),
        c.outstanding.toFixed(2),
        c.lastActivityDate,
        c.clientSinceDate,
      ])
    );
    // BOM so Excel reads the file as UTF-8 (names with accents).
    const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tenantSlug}-clients-${new Date().toISOString().slice(0, 10)}.csv`;
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
    { id: "OWING", label: "Balance due" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">Clients</span>
          <h1 className="text-2xl font-black tracking-tight text-white">Client directory</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Everyone with an account at your studio, with their bookings, projects and balance.
          </p>
        </div>
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
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter clients">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors",
              filter === f.id
                ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border-zinc-800"
            )}
          >
            {f.label}
            <span className={cn("text-[10px]", filter === f.id ? "text-amber-300" : "text-zinc-500")}>{counts[f.id]}</span>
          </button>
        ))}
      </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={visible.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 text-xs font-mono text-zinc-300 hover:text-white disabled:opacity-40 transition-colors"
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
        <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-xs text-zinc-400">
          No clients match this search or filter.
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_5rem_5rem_minmax(0,1fr)_minmax(0,1fr)_7rem_1rem] gap-4 px-4 py-2.5 border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            <span>Client</span>
            <span>Phone</span>
            <span className="text-right">Bookings</span>
            <span className="text-right">Projects</span>
            <span className="text-right">Paid</span>
            <span className="text-right">Balance due</span>
            <span className="text-right">Last active</span>
            <span />
          </div>
          <ul className="divide-y divide-zinc-800/80">
            {visible.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/${tenantSlug}/admin/clients/${c.id}`}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_5rem_5rem_minmax(0,1fr)_minmax(0,1fr)_7rem_1rem] gap-x-4 gap-y-1 items-center px-4 py-3 hover:bg-zinc-800/40 focus-visible:bg-zinc-800/40 outline-none transition-colors"
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
                  <span className="hidden md:block text-xs font-mono text-zinc-300 text-right tabular-nums">
                    {formatMoney(currency, c.paid)}
                  </span>
                  <span
                    className={cn(
                      "hidden md:block text-xs font-mono text-right tabular-nums",
                      c.outstanding > 0 ? "text-amber-400 font-semibold" : "text-zinc-500"
                    )}
                  >
                    {c.outstanding > 0 ? formatMoney(currency, c.outstanding) : "—"}
                  </span>
                  <span className="hidden md:block text-xs font-mono text-zinc-400 text-right">{c.lastActivityLabel}</span>
                  <ChevronRight className="size-4 text-zinc-600 group-hover:text-amber-400 transition-colors justify-self-end" aria-hidden="true" />

                  {/* Phone summary line */}
                  <div className="md:hidden col-span-2 flex items-center gap-3 text-[11px] font-mono text-zinc-400">
                    <span>{c.bookingCount} {c.bookingCount === 1 ? "booking" : "bookings"}</span>
                    <span>{c.projectCount} {c.projectCount === 1 ? "project" : "projects"}</span>
                    {c.outstanding > 0 && (
                      <span className="text-amber-400 font-semibold">{formatMoney(currency, c.outstanding)} due</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Building2, Banknote, CalendarClock, ExternalLink, Settings, Search, ArrowLeft, SlidersHorizontal } from "lucide-react";
import type { PlatformMetrics } from "@/lib/actions/super-admin";
import type { PlanState } from "@/lib/billing/state";
import { PLANS, asPlanCode } from "@/lib/billing/plans";
import { studioLink } from "@/lib/domain-name";
import { ManageStudioPanel } from "@/components/super-admin/manage-studio-panel";
import { InviteRequestsPanel } from "@/components/super-admin/invite-requests-panel";
import type { InviteRequestRow } from "@/lib/actions/invite-requests";

export interface TenantSummaryItem {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  discipline: string;
  currency: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  state: PlanState;
  endsOn: string | null;
  graceEndsOn: string | null;
  trialEndsAt: Date | string | null;
  paidUntil: Date | string | null;
  pausedAt: Date | string | null;
  pauseReason: string | null;
  teamUsed: number;
  teamLimit: number | null;
  lastActive: Date | string | null;
  createdAt: Date | string;
  userCount: number;
  bookingCount: number;
  projectCount: number;
  slotCount: number;
  totalPaidRevenue: number;
}

interface SuperAdminViewProps {
  metrics: PlatformMetrics;
  tenants: TenantSummaryItem[];
  invites?: InviteRequestRow[];
}

const STATE_STYLE: Record<PlanState, { label: string; chip: string }> = {
  TRIAL: { label: "Trial", chip: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  ACTIVE: { label: "Active", chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  OVERDUE: { label: "Overdue", chip: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  PAUSED: { label: "Paused", chip: "bg-red-500/10 text-red-300 border-red-500/30" },
  CLOSED: { label: "Closed", chip: "bg-zinc-800 text-zinc-400 border-zinc-700" },
};

const money = (n: number) => `RM ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (key: string | null) =>
  key ? new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
const when = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }) : "Never";

/** The date that matters for a studio, with its words: "Trial ends 8 Dec 2026", "Paid until …", "Paused". */
function dateLine(t: TenantSummaryItem): string {
  if (t.state === "CLOSED") return "Closed";
  if (t.state === "PAUSED") return t.pauseReason === "MANUAL" ? "Paused by you" : t.endsOn ? `Ended ${day(t.endsOn)}` : "Paused";
  if (t.state === "TRIAL") return `Trial ends ${day(t.endsOn)}`;
  if (t.state === "OVERDUE") return `Ended ${day(t.endsOn)} · grace to ${day(t.graceEndsOn)}`;
  return t.endsOn ? `Paid until ${day(t.endsOn)}` : "No end date";
}

export function SuperAdminView({ metrics, tenants, invites = [] }: SuperAdminViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"ALL" | PlanState>("ALL");
  const [managingId, setManagingId] = useState<string | null>(null);
  // Read the live row, so the panel reflects a pause/payment as soon as the list refreshes.
  const managing = tenants.find((t) => t.id === managingId) ?? null;

  const filtered = tenants.filter((t) => {
    const q = searchQuery.trim().toLowerCase();
    return (!q || t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)) && (stateFilter === "ALL" || t.state === stateFilter);
  });

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="space-y-1.5 border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-2 text-xs font-mono">
            <Link href="/" className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Platform
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-amber-400 uppercase tracking-wider">Super-admin</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Studios &amp; plans</h1>
          </div>
        </header>

        <section aria-label="Totals" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#121215] space-y-3">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Studios</span>
              <Building2 className="size-4 text-amber-400" aria-hidden="true" />
            </div>
            <div className="font-mono text-3xl font-bold text-white tabular-nums">{metrics.totalStudios}</div>
            <p className="text-xs text-zinc-400 font-mono">
              {metrics.byState.ACTIVE} active · {metrics.byState.TRIAL} trial · {metrics.byState.OVERDUE} overdue · {metrics.byState.PAUSED} paused
            </p>
          </div>
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#121215] space-y-3">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Recorded this month</span>
              <Banknote className="size-4 text-emerald-400" aria-hidden="true" />
            </div>
            <div className="font-mono text-3xl font-bold text-emerald-400 tabular-nums">{money(metrics.revenueThisMonth)}</div>
            <p className="text-xs text-zinc-400 font-mono">Plan payments you recorded</p>
          </div>
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#121215] space-y-3">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Last 12 months</span>
              <Banknote className="size-4 text-emerald-400" aria-hidden="true" />
            </div>
            <div className="font-mono text-3xl font-bold text-white tabular-nums">{money(metrics.revenue12m)}</div>
            <p className="text-xs text-zinc-400 font-mono">Plan payments you recorded</p>
          </div>
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#121215] space-y-3">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Ending in 7 days</span>
              <CalendarClock className="size-4 text-amber-400" aria-hidden="true" />
            </div>
            <div className="font-mono text-3xl font-bold text-white tabular-nums">{metrics.endingSoon.length}</div>
            <p className="text-xs text-zinc-400 font-mono">
              {metrics.endingSoon.length ? metrics.endingSoon.map((e) => `${e.name} (${day(e.endsOn)})`).join(", ") : "None"}
            </p>
          </div>
        </section>

        <section aria-label="Studios" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search studios by name or address"
                aria-label="Search studios"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as "ALL" | PlanState)}
              aria-label="Filter by status"
              className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">All statuses</option>
              {(Object.keys(STATE_STYLE) as PlanState[]).map((s) => (
                <option key={s} value={s}>
                  {STATE_STYLE[s].label}
                </option>
              ))}
            </select>
          </div>

          {/* Phone: one card per studio. */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((t) => (
              <li key={t.id} className="rounded-xl border border-zinc-800 bg-[#121215] p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">{t.name}</div>
                    <div className="text-xs text-zinc-400 font-mono truncate">{t.customDomain ?? t.slug}</div>
                  </div>
                  <StateChip state={t.state} />
                </div>
                <div className="text-xs font-mono text-zinc-300 space-y-0.5">
                  <div>
                    {PLANS[asPlanCode(t.subscriptionTier)].name} plan · {dateLine(t)}
                  </div>
                  <div className="text-zinc-400">
                    Team {t.teamUsed}/{t.teamLimit ?? "∞"} · {t.bookingCount} bookings · last active {when(t.lastActive)}
                  </div>
                </div>
                <RowActions t={t} onManage={() => setManagingId(t.id)} />
              </li>
            ))}
          </ul>

          {/* Computer: a table. */}
          <div className="hidden md:block rounded-2xl border border-zinc-800 bg-[#121215] overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] font-mono uppercase text-zinc-400 border-b border-zinc-800 bg-zinc-900/60">
                <tr>
                  <th scope="col" className="px-4 py-3">Studio</th>
                  <th scope="col" className="px-4 py-3">Plan</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Team</th>
                  <th scope="col" className="px-4 py-3 text-right">Bookings</th>
                  <th scope="col" className="px-4 py-3 text-right">Client revenue</th>
                  <th scope="col" className="px-4 py-3">Last active</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{t.name}</div>
                      <div className="text-xs text-zinc-400 font-mono">{t.customDomain ?? t.slug}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-300">{PLANS[asPlanCode(t.subscriptionTier)].name}</td>
                    <td className="px-4 py-3">
                      <StateChip state={t.state} />
                      <div className="text-[11px] text-zinc-400 font-mono mt-1">{dateLine(t)}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-zinc-300">
                      {t.teamUsed}/{t.teamLimit ?? "∞"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-zinc-300">{t.bookingCount}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-amber-400 font-semibold">
                      {t.currency === "MYR" ? "RM " : "$"}
                      {t.totalPaidRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{when(t.lastActive)}</td>
                    <td className="px-4 py-3 text-right">
                      <RowActions t={t} onManage={() => setManagingId(t.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && <p className="py-10 text-center text-sm text-zinc-400">No studios match.</p>}
        </section>

        <InviteRequestsPanel invites={invites} />
      </div>

      {managing && <ManageStudioPanel key={managing.id} studio={managing} onClose={() => setManagingId(null)} />}
    </div>
  );
}

function StateChip({ state }: { state: PlanState }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-mono shrink-0 ${STATE_STYLE[state].chip}`}>
      {STATE_STYLE[state].label}
    </span>
  );
}

function RowActions({ t, onManage }: { t: TenantSummaryItem; onManage: () => void }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <Link
        href={studioLink(t.slug, "/")}
        className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
        title="Open the studio's website"
        aria-label={`Open ${t.name}'s website`}
      >
        <ExternalLink className="size-3.5" />
      </Link>
      <Link
        href={studioLink(t.slug, "/admin")}
        className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors"
        title="Open the studio's admin"
        aria-label={`Open ${t.name}'s admin`}
      >
        <Settings className="size-3.5" />
      </Link>
      <button
        type="button"
        onClick={onManage}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors min-h-9"
      >
        <SlidersHorizontal className="size-3.5" aria-hidden="true" />
        Manage
      </button>
    </div>
  );
}

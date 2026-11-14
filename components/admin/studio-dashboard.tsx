"use client";

import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  ShieldAlert,
  Calendar,
  Layers,
  FileText,
  Clock,
  ArrowUpRight,
  Camera,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  ChevronRight,
} from "lucide-react";
import type { StudioAnalyticsData } from "@/lib/actions/admin-analytics";
import { conditionLabel, milestoneLabel } from "@/lib/labels";

interface StudioDashboardProps {
  data: StudioAnalyticsData;
  /** Onboarding help (setup checklist) shown between the header and the KPI cards. */
  guide?: React.ReactNode;
}

export function StudioDashboard({ data, guide }: StudioDashboardProps) {
  const { tenant, kpis, proposalsSummary, recentInvoices, upcomingCallSheets, gearAlerts } = data;
  const currency = tenant.currency || "USD";

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PAID":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium whitespace-nowrap bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="size-3" />
            PAID
          </span>
        );
      case "PENDING_VERIFICATION":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium whitespace-nowrap bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse">
            <Clock className="size-3" />
            PENDING VERIFY
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium whitespace-nowrap bg-zinc-800 text-zinc-400 border border-zinc-700">
            <Clock className="size-3" />
            PENDING
          </span>
        );
      case "OVERDUE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium whitespace-nowrap bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="size-3" />
            OVERDUE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium whitespace-nowrap bg-zinc-800 text-zinc-400 border border-zinc-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Top Welcome & Mission Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Overview
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              /{tenant.slug}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
            {tenant.name}
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Money in and waiting, gear on hand, upcoming shoots and open proposals at a glance.
          </p>
        </div>

        {/* Fast Action Quick Jump Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {kpis.pendingVerificationCount > 0 && (
            <Link
              href={`/${tenant.slug}/admin/verification`}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-black font-semibold text-xs tracking-wide hover:bg-amber-400 transition-colors shadow-sm shadow-amber-500/20"
            >
              <ShieldAlert className="size-4" />
              <span>Verify {kpis.pendingVerificationCount} {kpis.pendingVerificationCount === 1 ? "Payment" : "Payments"}</span>
            </Link>
          )}
          <Link
            href={`/${tenant.slug}/admin/calendar`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-mono transition-colors"
          >
            <Calendar className="size-3.5 text-amber-400" />
            <span>Open Calendar</span>
          </Link>
          <Link
            href={`/${tenant.slug}/admin/inventory`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-mono transition-colors"
          >
            <Layers className="size-3.5 text-amber-400" />
            <span>Gear</span>
          </Link>
        </div>
      </div>

      {guide}

      {/* KPI Cards Grid */}
      <div data-tour="kpis" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Collected Revenue */}
        <Link
          href={`/${tenant.slug}/admin/invoices`}
          className="group p-5 rounded-xl bg-gradient-to-br from-[#121215] to-[#18181c] border border-zinc-800/80 hover:border-emerald-500/40 transition-all shadow-sm block"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-mono uppercase tracking-wider group-hover:text-zinc-200 transition-colors">Settled Revenue</span>
            <div className="size-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 group-hover:scale-105 transition-all">
              <DollarSign className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-white tabular-nums group-hover:text-emerald-300 transition-colors">
              {formatCurrency(kpis.totalRevenue)}
            </div>
            <div className="flex items-center justify-between mt-1 text-xs text-zinc-400">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="size-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-mono">100% verified</span>
              </div>
              <span className="text-zinc-500 group-hover:text-emerald-400 font-mono text-[11px] flex items-center gap-0.5">
                View <ChevronRight className="size-3" />
              </span>
            </div>
          </div>
        </Link>

        {/* Metric 2: Pending Invoices / Verification */}
        <Link
          href={`/${tenant.slug}/admin/verification`}
          className="group p-5 rounded-xl bg-gradient-to-br from-[#121215] to-[#18181c] border border-zinc-800/80 hover:border-amber-500/40 transition-all shadow-sm block"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-mono uppercase tracking-wider group-hover:text-zinc-200 transition-colors">Pending Verification</span>
            <div className="size-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/20 group-hover:scale-105 transition-all">
              <Clock className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-amber-400 tabular-nums">
              {formatCurrency(kpis.pendingVerificationAmount)}
            </div>
            <div className="flex items-center justify-between mt-1 text-xs text-zinc-400">
              <span>{kpis.pendingVerificationCount} {kpis.pendingVerificationCount === 1 ? "proof" : "proofs"} queued</span>
              <span className="text-amber-400 group-hover:underline flex items-center gap-0.5 text-[11px]">
                Review <ChevronRight className="size-3" />
              </span>
            </div>
          </div>
        </Link>

        {/* Metric 3: Active Productions & Shoots */}
        <div className="group p-5 rounded-xl bg-gradient-to-br from-[#121215] to-[#18181c] border border-zinc-800/80 hover:border-blue-500/40 transition-all shadow-sm">
          <Link href={`/${tenant.slug}/admin/projects`} className="block">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider group-hover:text-zinc-200 transition-colors">Active Productions</span>
              <div className="size-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 group-hover:scale-105 transition-all">
                <Camera className="size-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-black tracking-tight text-white tabular-nums group-hover:text-blue-300 transition-colors">
                {kpis.activeProjectsCount}
              </div>
            </div>
          </Link>
          <div className="flex items-center justify-between mt-2 text-xs text-zinc-400 pt-2 border-t border-zinc-800/60">
            <Link
              href={`/${tenant.slug}/admin/bookings`}
              className="text-zinc-400 hover:text-amber-400 hover:underline flex items-center gap-0.5"
            >
              {kpis.confirmedBookingsCount} confirmed {kpis.confirmedBookingsCount === 1 ? "booking" : "bookings"}
            </Link>
            <Link
              href={`/${tenant.slug}/admin/projects`}
              className="text-zinc-500 hover:text-zinc-300 hover:underline"
            >
              {kpis.completedProjectsCount} delivered
            </Link>
          </div>
        </div>

        {/* Metric 4: Fleet Readiness & Quarantine */}
        <Link
          href={`/${tenant.slug}/admin/inventory`}
          className="group p-5 rounded-xl bg-gradient-to-br from-[#121215] to-[#18181c] border border-zinc-800/80 hover:border-purple-500/40 transition-all shadow-sm block"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-mono uppercase tracking-wider group-hover:text-zinc-200 transition-colors">Gear Available</span>
            <div className="size-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:bg-purple-500/20 group-hover:scale-105 transition-all">
              <Layers className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-white tabular-nums group-hover:text-purple-300 transition-colors">
                {kpis.gearAvailableCount}/{kpis.gearTotalCount}
              </span>
              <span className="text-xs font-mono text-zinc-400">ready to book</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-xs text-zinc-400">
              <span className="text-zinc-400 font-mono whitespace-nowrap">{kpis.gearUtilizationRate}% in use</span>
              {kpis.gearMaintenanceCount > 0 ? (
                <span className="text-rose-400 font-mono whitespace-nowrap">{kpis.gearMaintenanceCount} in repair</span>
              ) : (
                <span className="text-emerald-400 font-mono whitespace-nowrap">fleet 100% operational</span>
              )}
            </div>
          </div>
        </Link>
      </div>

      {/* Middle Section: Financial Pipeline & Upcoming Shoots Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Cash Flow Invoices & Milestone Status */}
        <div className="lg:col-span-2 rounded-xl bg-[#121215] border border-zinc-800 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="size-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Recent invoices
              </h2>
            </div>
            <Link
              href={`/${tenant.slug}/admin/invoices`}
              className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1 whitespace-nowrap"
            >
              All Invoices <ArrowUpRight className="size-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/60 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800/80">
                <tr>
                  <th className="px-3 py-3 first:pl-5 last:pr-5 font-semibold">Invoice #</th>
                  <th className="px-3 py-3 first:pl-5 last:pr-5 font-semibold">Client / Project</th>
                  <th className="px-3 py-3 first:pl-5 last:pr-5 font-semibold">Milestone</th>
                  <th className="px-3 py-3 first:pl-5 last:pr-5 font-semibold text-right">Amount</th>
                  <th className="px-3 py-3 first:pl-5 last:pr-5 font-semibold text-center">Status</th>
                  <th className="px-3 py-3 first:pl-5 last:pr-5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {recentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-zinc-500 font-mono">
                      No milestone invoices issued yet.
                    </td>
                  </tr>
                ) : (
                  recentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-zinc-800/30 transition-colors group">
                      <td className="px-3 py-3 first:pl-5 last:pr-5 whitespace-nowrap">
                        <Link
                          href={`/${tenant.slug}/admin/invoices/${inv.id}`}
                          className="font-bold text-amber-400 hover:text-amber-300 hover:underline inline-flex items-center gap-1 group/link"
                        >
                          <span>{inv.invoiceNumber}</span>
                          <ArrowUpRight className="size-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                        </Link>
                      </td>
                      <td className="px-3 py-3 first:pl-5 last:pr-5">
                        <div className="font-sans font-medium text-white">{inv.clientName}</div>
                        {inv.projectId && inv.projectTitle ? (
                          <Link
                            href={`/${tenant.slug}/admin/projects/${inv.projectId}`}
                            className="text-[11px] text-zinc-400 hover:text-amber-400 font-sans truncate max-w-[160px] block hover:underline transition-colors"
                            title={inv.projectTitle}
                          >
                            {inv.projectTitle}
                          </Link>
                        ) : inv.projectTitle ? (
                          <div className="text-[11px] text-zinc-400 font-sans truncate max-w-[160px]">
                            {inv.projectTitle}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 first:pl-5 last:pr-5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 whitespace-nowrap">
                          {milestoneLabel(inv.milestoneType)}
                        </span>
                      </td>
                      <td className="px-3 py-3 first:pl-5 last:pr-5 text-right font-bold text-white tabular-nums whitespace-nowrap">
                        {formatCurrency(inv.amount)}
                      </td>
                      <td className="px-3 py-3 first:pl-5 last:pr-5 text-center whitespace-nowrap">
                        {getStatusBadge(inv.status)}
                      </td>
                      <td className="px-3 py-3 first:pl-5 last:pr-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {inv.status === "PENDING_VERIFICATION" && (
                            <Link
                              href={`/${tenant.slug}/admin/verification`}
                              className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-semibold text-[10px] uppercase tracking-wider transition-colors inline-block whitespace-nowrap"
                            >
                              Review Proof
                            </Link>
                          )}
                          <Link
                            href={`/${tenant.slug}/admin/invoices/${inv.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 hover:text-white text-[11px] font-sans transition-colors whitespace-nowrap"
                          >
                            View
                            <ChevronRight className="size-3 text-amber-400" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Proposal Funnel & Fleet Watch */}
        <div className="space-y-6">
          {/* Proposal Pipeline Card */}
          <div className="p-5 rounded-xl bg-[#121215] border border-zinc-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-amber-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Proposals
                </h3>
              </div>
              <Link
                href={`/${tenant.slug}/admin/proposals`}
                className="text-[11px] font-mono text-zinc-400 hover:text-amber-400"
              >
                Configure
              </Link>
            </div>

            <Link
              href={`/${tenant.slug}/admin/proposals`}
              className="block bg-zinc-900/80 hover:bg-zinc-800/80 transition-colors p-3.5 rounded-lg border border-zinc-800/80 group space-y-1"
            >
              <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono uppercase">
                <span>Total Pipeline Value</span>
                <ChevronRight className="size-3 text-zinc-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-xl font-black text-white tabular-nums group-hover:text-amber-400 transition-colors">
                {formatCurrency(proposalsSummary.totalPipelineValue)}
              </div>
            </Link>

            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <Link
                href={`/${tenant.slug}/admin/proposals`}
                className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all block group"
              >
                <div className="text-base font-bold text-emerald-400 tabular-nums">
                  {proposalsSummary.accepted}
                </div>
                <div className="text-[10px] text-zinc-400 uppercase mt-0.5 group-hover:text-zinc-200">Signed</div>
              </Link>
              <Link
                href={`/${tenant.slug}/admin/proposals`}
                className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all block group"
              >
                <div className="text-base font-bold text-amber-400 tabular-nums">
                  {proposalsSummary.sent}
                </div>
                <div className="text-[10px] text-zinc-400 uppercase mt-0.5 group-hover:text-zinc-200">In Review</div>
              </Link>
              <Link
                href={`/${tenant.slug}/admin/proposals`}
                className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all block group"
              >
                <div className="text-base font-bold text-zinc-400 tabular-nums">
                  {proposalsSummary.draft}
                </div>
                <div className="text-[10px] text-zinc-400 uppercase mt-0.5 group-hover:text-zinc-200">Draft</div>
              </Link>
            </div>
          </div>

          {/* Gear Fleet Maintenance Alerts */}
          <div className="p-5 rounded-xl bg-[#121215] border border-zinc-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Gear status
                </h3>
              </div>
              <Link
                href={`/${tenant.slug}/admin/inventory`}
                className="text-[11px] font-mono text-zinc-400 hover:text-amber-400"
              >
                Gear
              </Link>
            </div>

            {gearAlerts.length === 0 ? (
              <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-center">
                <CheckCircle2 className="size-5 text-emerald-400 mx-auto mb-1" />
                <div className="text-xs font-medium text-emerald-300">All Equipment Operational</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">Zero items quarantined or under repair</div>
              </div>
            ) : (
              <div className="space-y-2">
                {gearAlerts.map((item) => (
                  <Link
                    key={item.id}
                    href={`/${tenant.slug}/admin/inventory`}
                    className="p-2.5 rounded-lg bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all flex items-center justify-between text-xs font-mono group block"
                  >
                    <div>
                      <div className="font-semibold text-zinc-200 group-hover:text-amber-400 transition-colors flex items-center gap-1">
                        <span>{item.name}</span>
                        <ArrowUpRight className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-[10px] text-zinc-500">{item.category} · {item.serialNumber || "No SN"}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.status === "MAINTENANCE"
                          ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                          : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {conditionLabel(item.condition)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Upcoming Shoots & Direct Production Call Sheets */}
      <div className="rounded-xl bg-[#121215] border border-zinc-800 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Upcoming shoot days
            </h2>
          </div>
          <Link
            href={`/${tenant.slug}/admin/projects`}
            className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1"
          >
            Projects <ChevronRight className="size-3" />
          </Link>
        </div>

        {upcomingCallSheets.length === 0 ? (
          <div className="py-8 text-center text-zinc-500 text-xs font-mono">
            No upcoming call sheets scheduled yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingCallSheets.map((cs) => (
              <div
                key={cs.id}
                className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span className="text-amber-400 font-bold truncate max-w-[160px]">{cs.title}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" /> {cs.callTime}
                    </span>
                  </div>
                  {cs.projectId ? (
                    <Link
                      href={`/${tenant.slug}/admin/projects/${cs.projectId}`}
                      className="text-sm font-bold text-white mt-1.5 line-clamp-1 hover:text-amber-400 transition-colors block"
                    >
                      {cs.projectTitle}
                    </Link>
                  ) : (
                    <h4 className="text-sm font-bold text-white mt-1.5 line-clamp-1">
                      {cs.projectTitle}
                    </h4>
                  )}
                  <div className="flex items-center gap-1 text-xs text-zinc-400 mt-2 font-mono">
                    <MapPin className="size-3 text-zinc-500 flex-shrink-0" />
                    <span className="truncate">{cs.locationName}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase truncate max-w-[140px]">
                    {cs.weatherSummary || "Scheduled Shoot"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {cs.projectId && (
                      <Link
                        href={`/${tenant.slug}/admin/projects/${cs.projectId}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono text-zinc-200 hover:text-white transition-colors"
                      >
                        Project <ChevronRight className="size-3 text-zinc-400" />
                      </Link>
                    )}
                    <Link
                      href={`/${tenant.slug}/set-hud/${cs.id}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-[10px] font-mono text-amber-300 transition-colors"
                    >
                      Set HUD <ArrowUpRight className="size-3 text-amber-400" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

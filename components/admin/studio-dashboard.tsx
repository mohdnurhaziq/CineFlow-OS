"use client";

import { PageHeader } from "@/components/ui/page";
import { buttonVariants } from "@/components/ui/button";
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
  LayoutDashboard,
} from "lucide-react";
import type { StudioAnalyticsData } from "@/lib/analytics/studio-analytics";
import { conditionLabel, invoiceStatusLabel, milestoneLabel } from "@/lib/labels";
import { studioPath } from "@/lib/domain-name";
import { gearNotes, gearPanelAllClear, revenueNote } from "@/lib/analytics/kpi-notes";
import { formatMoney } from "@/lib/money";

interface StudioDashboardProps {
  data: StudioAnalyticsData;
  /** Onboarding help (setup checklist) shown between the header and the KPI cards. */
  guide?: React.ReactNode;
  /** Upcoming bookings with nobody assigned (0 when the viewer can't see every booking). */
  unassignedUpcoming?: number;
}

export function StudioDashboard({ data, guide, unassignedUpcoming = 0 }: StudioDashboardProps) {
  const { sections, tenant, kpis, proposalsSummary, recentInvoices, upcomingCallSheets, gearAlerts } = data;
  const nothingToShow = !sections.money && !sections.work && !sections.gear && !sections.proposals && !sections.shoots;
  const currency = tenant.currency || "USD";
  const gear = gearNotes({ total: kpis.gearTotalCount, maintenance: kpis.gearMaintenanceCount, utilization: kpis.gearUtilizationRate });

  // Same two-decimal money format as Invoices, Clients and Galleries.
  const money = (amount: number) => formatMoney(currency, amount);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PAID":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium whitespace-nowrap bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="size-3" />
            {invoiceStatusLabel(status)}
          </span>
        );
      case "PENDING_VERIFICATION":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium whitespace-nowrap bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse">
            <Clock className="size-3" />
            {invoiceStatusLabel(status)}
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium whitespace-nowrap bg-zinc-800 text-zinc-400 border border-zinc-700">
            <Clock className="size-3" />
            {invoiceStatusLabel(status)}
          </span>
        );
      case "OVERDUE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium whitespace-nowrap bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="size-3" />
            {invoiceStatusLabel(status)}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium whitespace-nowrap bg-zinc-800 text-zinc-400 border border-zinc-700">
            {invoiceStatusLabel(status)}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        icon={LayoutDashboard}
        title="Overview"
        description="Money in and waiting, gear on hand, upcoming shoots and open proposals at a glance."
        actions={
          <>
          {sections.money && kpis.pendingVerificationCount > 0 && (
            <Link
              href={studioPath(tenant.slug, "/admin/verification")}
              className={buttonVariants()}
            >
              <ShieldAlert className="size-4" />
              <span>Verify {kpis.pendingVerificationCount} {kpis.pendingVerificationCount === 1 ? "Payment" : "Payments"}</span>
            </Link>
          )}
          {sections.calendar && (
            <Link
              href={studioPath(tenant.slug, "/admin/calendar")}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Calendar className="size-3.5 text-amber-400" />
              <span>Open Calendar</span>
            </Link>
          )}
          {sections.gear && (
            <Link
              href={studioPath(tenant.slug, "/admin/inventory")}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Layers className="size-3.5 text-amber-400" />
              <span>Gear</span>
            </Link>
          )}
          </>
        }
      />

      {guide}

      {unassignedUpcoming > 0 && (
        <Link
          href={studioPath(tenant.slug, "/admin/bookings?filter=unassigned")}
          className="flex items-center gap-2 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200 hover:bg-amber-500/15 transition-colors"
        >
          <AlertTriangle className="size-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            {unassignedUpcoming} upcoming {unassignedUpcoming === 1 ? "booking has" : "bookings have"} nobody assigned
          </span>
          <ChevronRight className="size-4 text-amber-400" aria-hidden="true" />
        </Link>
      )}

      {nothingToShow && (
        <p className="text-sm text-zinc-400">Use the menu above for the parts of the studio you work on.</p>
      )}

      {/* KPI Cards Grid */}
      {(sections.money || sections.work || sections.gear) && (
      <div data-tour="kpis" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Collected Revenue */}
        {sections.money && (
        <Link
          href={studioPath(tenant.slug, "/admin/invoices")}
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
              {money(kpis.totalRevenue)}
            </div>
            <div className="flex items-center justify-between mt-1 text-xs text-zinc-400">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="size-3.5 text-emerald-400" />
                <span className={`font-mono ${kpis.totalRevenue > 0 ? "text-emerald-400" : "text-zinc-400"}`}>{revenueNote(kpis.totalRevenue)}</span>
              </div>
              <span className="text-zinc-400 group-hover:text-emerald-400 font-mono text-[11px] flex items-center gap-0.5">
                View <ChevronRight className="size-3" />
              </span>
            </div>
          </div>
        </Link>
        )}

        {/* Metric 2: Pending Invoices / Verification */}
        {sections.money && (
        <Link
          href={studioPath(tenant.slug, "/admin/verification")}
          className="group p-5 rounded-xl bg-gradient-to-br from-[#121215] to-[#18181c] border border-zinc-800/80 hover:border-amber-500/40 transition-all shadow-sm block"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-mono uppercase tracking-wider group-hover:text-zinc-200 transition-colors">Awaiting verification</span>
            <div className="size-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/20 group-hover:scale-105 transition-all">
              <Clock className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-amber-400 tabular-nums">
              {money(kpis.pendingVerificationAmount)}
            </div>
            <div className="flex items-center justify-between mt-1 text-xs text-zinc-400">
              <span>{kpis.pendingVerificationCount} {kpis.pendingVerificationCount === 1 ? "proof" : "proofs"} queued</span>
              <span className="text-amber-400 group-hover:underline flex items-center gap-0.5 text-[11px]">
                Review <ChevronRight className="size-3" />
              </span>
            </div>
          </div>
        </Link>
        )}

        {/* Metric 3: Active Productions & Shoots */}
        {sections.work && (
        <div className="group p-5 rounded-xl bg-gradient-to-br from-[#121215] to-[#18181c] border border-zinc-800/80 hover:border-blue-500/40 transition-all shadow-sm">
          <Link href={studioPath(tenant.slug, "/admin/projects")} className="block">
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
              href={studioPath(tenant.slug, "/admin/bookings")}
              className="text-zinc-400 hover:text-amber-400 hover:underline flex items-center gap-0.5"
            >
              {kpis.confirmedBookingsCount} confirmed {kpis.confirmedBookingsCount === 1 ? "booking" : "bookings"}
            </Link>
            <Link
              href={studioPath(tenant.slug, "/admin/projects")}
              className="text-zinc-400 hover:text-zinc-300 hover:underline"
            >
              {kpis.completedProjectsCount} delivered
            </Link>
          </div>
        </div>
        )}

        {/* Metric 4: Fleet Readiness & Quarantine */}
        {sections.gear && (
        <Link
          href={studioPath(tenant.slug, "/admin/inventory")}
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
              <span className="text-zinc-400 font-mono whitespace-nowrap">{gear.use}</span>
              {gear.condition && (
                <span className={`font-mono whitespace-nowrap ${gear.repair ? "text-rose-400" : "text-emerald-400"}`}>{gear.condition}</span>
              )}
            </div>
          </div>
        </Link>
        )}
      </div>
      )}

      {/* Middle Section: Financial Pipeline & Upcoming Shoots Grid */}
      {(sections.money || sections.proposals || sections.gear) && (
      <div className={sections.money ? "grid grid-cols-1 lg:grid-cols-3 gap-6" : "grid grid-cols-1 md:grid-cols-2 gap-6"}>
        {/* Left 2 Cols: Recent Cash Flow Invoices & Milestone Status */}
        {sections.money && (
        <div className="lg:col-span-2 rounded-xl bg-[#121215] border border-zinc-800 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="size-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Recent invoices
              </h2>
            </div>
            <Link
              href={studioPath(tenant.slug, "/admin/invoices")}
              className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1 whitespace-nowrap"
            >
              All Invoices <ArrowUpRight className="size-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/60 text-zinc-400 uppercase text-[11px] tracking-wider border-b border-zinc-800/80">
                <tr>
                  <th className="px-3 py-3 first:pl-5 last:pr-5 font-semibold">Invoice</th>
                  <th className="px-3 py-3 first:pl-5 last:pr-5 font-semibold">Client / Project</th>
                  <th className="px-3 py-3 first:pl-5 last:pr-5 font-semibold text-right">Amount</th>
                  <th className="px-3 py-3 first:pl-5 last:pr-5 font-semibold text-center">Status</th>
                  <th className="px-3 py-3 first:pl-5 last:pr-5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {recentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-zinc-400 font-mono">
                      No milestone invoices issued yet.
                    </td>
                  </tr>
                ) : (
                  recentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-zinc-800/30 transition-colors group">
                      <td className="px-3 py-3 first:pl-5 last:pr-5 whitespace-nowrap">
                        <Link
                          href={studioPath(tenant.slug, `/admin/invoices/${inv.id}`)}
                          className="font-bold text-amber-400 hover:text-amber-300 hover:underline inline-flex items-center gap-1 group/link"
                        >
                          <span>{inv.invoiceNumber}</span>
                          <ArrowUpRight className="size-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                        </Link>
                        <div className="text-[11px] text-zinc-400 font-sans mt-0.5">{milestoneLabel(inv.milestoneType)}</div>
                      </td>
                      <td className="px-3 py-3 first:pl-5 last:pr-5">
                        <div className="font-sans font-medium text-white">{inv.clientName}</div>
                        {inv.projectId && inv.projectTitle ? (
                          <Link
                            href={studioPath(tenant.slug, `/admin/projects/${inv.projectId}`)}
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
                      <td className="px-3 py-3 first:pl-5 last:pr-5 text-right font-bold text-white tabular-nums whitespace-nowrap">
                        {money(inv.amount)}
                      </td>
                      <td className="px-3 py-3 first:pl-5 last:pr-5 text-center whitespace-nowrap">
                        {getStatusBadge(inv.status)}
                      </td>
                      <td className="px-3 py-3 first:pl-5 last:pr-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {inv.status === "PENDING_VERIFICATION" ? (
                            <Link
                              href={studioPath(tenant.slug, "/admin/verification")}
                              className={buttonVariants({ size: "sm" })}
                            >
                              Verify
                              <ChevronRight className="size-3" />
                            </Link>
                          ) : (
                            <Link
                              href={studioPath(tenant.slug, `/admin/invoices/${inv.id}`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 hover:text-white text-[11px] font-sans transition-colors whitespace-nowrap"
                            >
                              View
                              <ChevronRight className="size-3 text-amber-400" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Right Col: Proposal Funnel & Fleet Watch (side by side when there are no invoices to show) */}
        <div className={sections.money ? "space-y-6" : "contents"}>
          {/* Proposal Pipeline Card */}
          {sections.proposals && (
          <div className="p-5 rounded-xl bg-[#121215] border border-zinc-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-amber-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Proposals
                </h3>
              </div>
              <Link
                href={studioPath(tenant.slug, "/admin/proposals")}
                className="text-[11px] font-mono text-zinc-400 hover:text-amber-400"
              >
                Configure
              </Link>
            </div>

            <Link
              href={studioPath(tenant.slug, "/admin/proposals")}
              className="block bg-zinc-900/80 hover:bg-zinc-800/80 transition-colors p-3.5 rounded-lg border border-zinc-800/80 group space-y-1"
            >
              <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono uppercase">
                <span>Total Pipeline Value</span>
                <ChevronRight className="size-3 text-zinc-400 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-xl font-black text-white tabular-nums group-hover:text-amber-400 transition-colors">
                {money(proposalsSummary.totalPipelineValue)}
              </div>
            </Link>

            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <Link
                href={studioPath(tenant.slug, "/admin/proposals")}
                className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all block group"
              >
                <div className="text-base font-bold text-emerald-400 tabular-nums">
                  {proposalsSummary.accepted}
                </div>
                <div className="text-[11px] text-zinc-400 uppercase mt-0.5 group-hover:text-zinc-200">Signed</div>
              </Link>
              <Link
                href={studioPath(tenant.slug, "/admin/proposals")}
                className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all block group"
              >
                <div className="text-base font-bold text-amber-400 tabular-nums">
                  {proposalsSummary.sent}
                </div>
                <div className="text-[11px] text-zinc-400 uppercase mt-0.5 group-hover:text-zinc-200">In Review</div>
              </Link>
              <Link
                href={studioPath(tenant.slug, "/admin/proposals")}
                className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all block group"
              >
                <div className="text-base font-bold text-zinc-400 tabular-nums">
                  {proposalsSummary.draft}
                </div>
                <div className="text-[11px] text-zinc-400 uppercase mt-0.5 group-hover:text-zinc-200">Draft</div>
              </Link>
            </div>
          </div>
          )}

          {/* Gear Fleet Maintenance Alerts */}
          {sections.gear && (
          <div className="p-5 rounded-xl bg-[#121215] border border-zinc-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Gear status
                </h3>
              </div>
              <Link
                href={studioPath(tenant.slug, "/admin/inventory")}
                className="text-[11px] font-mono text-zinc-400 hover:text-amber-400"
              >
                Gear
              </Link>
            </div>

            {gearAlerts.length === 0 ? (
              <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-center">
                <CheckCircle2 className="size-5 text-emerald-400 mx-auto mb-1" />
                <div className="text-xs font-medium text-emerald-300">{gearPanelAllClear(kpis.gearTotalCount).title}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">{gearPanelAllClear(kpis.gearTotalCount).detail}</div>
              </div>
            ) : (
              <div className="space-y-2">
                {gearAlerts.map((item) => (
                  <Link
                    key={item.id}
                    href={studioPath(tenant.slug, "/admin/inventory")}
                    className="p-2.5 rounded-lg bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all flex items-center justify-between text-xs font-mono group block"
                  >
                    <div>
                      <div className="font-semibold text-zinc-200 group-hover:text-amber-400 transition-colors flex items-center gap-1">
                        <span>{item.name}</span>
                        <ArrowUpRight className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-[11px] text-zinc-400">{item.category} · {item.serialNumber || "No SN"}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
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
          )}
        </div>
      </div>
      )}

      {/* Bottom Section: Upcoming Shoots & Direct Production Call Sheets */}
      {sections.shoots && (
      <div className="rounded-xl bg-[#121215] border border-zinc-800 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Upcoming shoot days
            </h2>
          </div>
          <Link
            href={studioPath(tenant.slug, "/admin/projects")}
            className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1"
          >
            Galleries <ChevronRight className="size-3" />
          </Link>
        </div>

        {upcomingCallSheets.length === 0 ? (
          <div className="py-8 text-center text-zinc-400 text-xs font-mono">
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
                  <div className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                    <span className="flex items-center gap-1.5 font-semibold text-white">
                      <Calendar className="size-3.5 text-amber-400" /> {cs.shootDate}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-zinc-400 whitespace-nowrap">
                      <Clock className="size-3" /> {cs.callTime}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-400 font-medium mt-1.5 line-clamp-2" title={cs.title}>
                    {cs.title}
                  </p>
                  {cs.projectId ? (
                    <Link
                      href={studioPath(tenant.slug, `/admin/projects/${cs.projectId}`)}
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
                    <MapPin className="size-3 text-zinc-400 flex-shrink-0" />
                    <span className="truncate">{cs.locationName}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase truncate max-w-[140px]">
                    {cs.weatherSummary || "Scheduled Shoot"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {cs.projectId && (
                      <Link
                        href={studioPath(tenant.slug, `/admin/projects/${cs.projectId}`)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] font-mono text-zinc-200 hover:text-white transition-colors"
                      >
                        Project <ChevronRight className="size-3 text-zinc-400" />
                      </Link>
                    )}
                    <Link
                      href={studioPath(tenant.slug, `/set-hud/${cs.id}`)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-[11px] font-mono text-amber-300 transition-colors"
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
      )}
    </div>
  );
}

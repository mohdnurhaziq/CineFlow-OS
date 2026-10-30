"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Building2,
  DollarSign,
  Calendar,
  Users,
  Search,
  ExternalLink,
  Settings,
  Activity,
  Layers,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  ArrowLeft,
} from "lucide-react";
import type { PlatformMetrics } from "@/lib/actions/super-admin";

interface TenantSummaryItem {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  discipline: string;
  tagline: string | null;
  brandColor: string | null;
  currency: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  createdAt: Date;
  userCount: number;
  bookingCount: number;
  projectCount: number;
  slotCount: number;
  totalPaidRevenue: number;
}

interface SuperAdminViewProps {
  metrics: PlatformMetrics;
  tenants: TenantSummaryItem[];
}

export function SuperAdminView({ metrics, tenants }: SuperAdminViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("ALL");

  const filteredTenants = tenants.filter((tenant) => {
    const matchesSearch =
      tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDiscipline =
      disciplineFilter === "ALL" || tenant.discipline === disciplineFilter;
    return matchesSearch && matchesDiscipline;
  });

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] py-10 px-4 sm:px-6 lg:px-8 space-y-10">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="text-xs font-mono text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
              >
                <ArrowLeft className="size-3.5" />
                Platform
              </Link>
              <span className="text-zinc-600">/</span>
              <span className="text-xs font-mono text-amber-400 uppercase tracking-wider">
                SUPER-ADMIN CONSOLE
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <ShieldCheck className="size-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Platform Operations &amp; Macro Telemetry
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              SYSTEM HEALTH: 100%
            </span>
          </div>
        </div>

        {/* 4 Macro KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Total Studios */}
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#121215] flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Active Studios</span>
              <Building2 className="size-4 text-amber-400" />
            </div>
            <div className="pt-3">
              <div className="font-mono text-3xl font-bold text-white tabular-nums">
                {metrics.totalStudios}
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-mono">
                {metrics.studiosByStatus["ACTIVE"] || 0} active • {metrics.studiosByTier["PRO"] || 0} pro tiers
              </p>
            </div>
          </div>

          {/* KPI 2: Estimated MRR */}
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#121215] flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Estimated MRR</span>
              <DollarSign className="size-4 text-emerald-400" />
            </div>
            <div className="pt-3">
              <div className="font-mono text-3xl font-bold text-emerald-400 tabular-nums">
                ${metrics.estimatedMrrUsd.toLocaleString()}
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-mono">
                USD SaaS recurring revenue
              </p>
            </div>
          </div>

          {/* KPI 3: Platform Bookings */}
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#121215] flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Total Bookings</span>
              <Calendar className="size-4 text-cyan-400" />
            </div>
            <div className="pt-3">
              <div className="font-mono text-3xl font-bold text-white tabular-nums">
                {metrics.totalBookings}
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-mono">
                {metrics.bookingsByStatus["CONFIRMED"] || 0} confirmed • {metrics.bookingsByStatus["PENDING"] || 0} pending
              </p>
            </div>
          </div>

          {/* KPI 4: Users & Projects */}
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#121215] flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-mono uppercase tracking-wider">Users &amp; Projects</span>
              <Users className="size-4 text-violet-400" />
            </div>
            <div className="pt-3">
              <div className="font-mono text-3xl font-bold text-white tabular-nums">
                {metrics.totalUsers}
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-mono">
                {metrics.activeProjects} active production projects
              </p>
            </div>
          </div>
        </div>

        {/* Currency GPV & Payment Verification Queue Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#121215] space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Settled GPV (USD Volume)
            </span>
            <div className="font-mono text-2xl font-bold text-amber-400 tabular-nums">
              ${metrics.paidRevenueUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-zinc-400 font-mono">Processed via Card &amp; Online</p>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800 bg-[#121215] space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Settled GPV (MYR Volume)
            </span>
            <div className="font-mono text-2xl font-bold text-cyan-400 tabular-nums">
              RM {metrics.paidRevenueMyr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-zinc-400 font-mono">Processed via Malaysian QR &amp; DuitNow</p>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800 bg-[#121215] space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Pending Manual Verification Queue
            </span>
            <div className="font-mono text-2xl font-bold text-amber-300 tabular-nums">
              {metrics.pendingVerificationCount} Invoices
            </div>
            <p className="text-xs text-zinc-400 font-mono">
              Pending QR slips &amp; Cash counter approvals
            </p>
          </div>
        </div>

        {/* Studio Directory Table */}
        <div className="rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Registered Studio Tenants</h2>
              <p className="text-xs text-zinc-400">
                Direct access to public showcases, admin consoles, and tenant-level configurations.
              </p>
            </div>

            {/* Filter and Search */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search studio or slug..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500 w-48 sm:w-60 font-mono"
                />
              </div>

              <select
                value={disciplineFilter}
                onChange={(e) => setDisciplineFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs font-mono focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All Disciplines</option>
                <option value="PHOTOGRAPHY">Photography</option>
                <option value="VIDEOGRAPHY">Videography</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#18181b] text-zinc-400 font-mono uppercase tracking-wider border-y border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Studio / Slug</th>
                  <th className="py-3 px-4">Discipline</th>
                  <th className="py-3 px-4">Tier &amp; Status</th>
                  <th className="py-3 px-4 text-center">Bookings</th>
                  <th className="py-3 px-4 text-center">Projects</th>
                  <th className="py-3 px-4 text-center">Slots</th>
                  <th className="py-3 px-4 text-right">Settled Revenue</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-400">
                      No studio tenants match the specified criteria.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => (
                    <tr key={t.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="size-7 rounded-md flex items-center justify-center font-bold text-black text-xs shrink-0"
                            style={{ backgroundColor: t.brandColor || "#f59e0b" }}
                          >
                            {t.name.slice(0, 1)}
                          </div>
                          <div>
                            <div className="font-semibold text-white font-sans">{t.name}</div>
                            <div className="text-[11px] text-zinc-400">/{t.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {t.discipline}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              t.subscriptionTier === "PRO"
                                ? "bg-amber-500/20 text-amber-300"
                                : t.subscriptionTier === "STUDIO_UNLIMITED"
                                ? "bg-violet-500/20 text-violet-300"
                                : "bg-zinc-800 text-zinc-300"
                            }`}
                          >
                            {t.subscriptionTier}
                          </span>
                          <span className="text-[10px] text-emerald-400">● ACTIVE</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums text-zinc-200">
                        {t.bookingCount}
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums text-zinc-200">
                        {t.projectCount}
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums text-zinc-200">
                        {t.slotCount}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-bold text-amber-400">
                        {t.currency === "MYR" ? "RM " : "$"}
                        {t.totalPaidRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/${t.slug}`}
                            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                            title="Open Showcase"
                          >
                            <ExternalLink className="size-3.5" />
                          </Link>
                          <Link
                            href={`/${t.slug}/admin`}
                            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors"
                            title="Studio Admin"
                          >
                            <Settings className="size-3.5" />
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

        {/* System Health Card */}
        <div className="p-6 rounded-2xl border border-zinc-800 bg-[#121215] space-y-4">
          <div className="flex items-center gap-2">
            <HardDrive className="size-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Self-Contained Local Infrastructure Telemetry
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono text-zinc-300">
            <div className="p-3 rounded-lg bg-[#18181b] border border-zinc-800 space-y-1">
              <span className="text-[10px] uppercase text-zinc-400">Database Engine</span>
              <div className="text-white font-semibold">SQLite dev.db (24 Models)</div>
              <div className="text-emerald-400 text-[11px]">● Connected &amp; Seeded</div>
            </div>

            <div className="p-3 rounded-lg bg-[#18181b] border border-zinc-800 space-y-1">
              <span className="text-[10px] uppercase text-zinc-400">Media Storage</span>
              <div className="text-white font-semibold">public/uploads/ (Local Self-Contained)</div>
              <div className="text-cyan-400 text-[11px]">● 0 Cloud Dependencies</div>
            </div>

            <div className="p-3 rounded-lg bg-[#18181b] border border-zinc-800 space-y-1">
              <span className="text-[10px] uppercase text-zinc-400">Payment Modes</span>
              <div className="text-white font-semibold">Card (Simulated) + QR Scan + Cash</div>
              <div className="text-amber-400 text-[11px]">● Studio Queue Active</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

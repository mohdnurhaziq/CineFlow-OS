"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Phone,
  MessageCircle,
  Images,
  CalendarClock,
  Eye,
  MapPin,
  Package as PackageIcon,
  CheckCircle2,
  Clock,
  Camera,
  Sparkles,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { formatSlotDate } from "@/lib/slot-time";
import { cn } from "@/lib/utils";
import type { ScheduleDay, ScheduleSession } from "@/lib/bookings/schedule";
import { studioPath } from "@/lib/domain-name";
import { buttonVariants } from "@/components/ui/button";
import { ShootDetailsDialog } from "./shoot-details-dialog";

interface MyScheduleProps {
  tenantSlug: string;
  tenantName?: string;
  tenantBio?: string | null;
  currency?: string;
  brandColor?: string | null;
  days: ScheduleDay[];
  past: boolean;
  /** Studio today, YYYY-MM-DD. */
  today: string;
  /** Project ids this person may open ("Open gallery"). */
  openableProjects: string[];
}

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  CONFIRMED: {
    label: "Confirmed",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: CheckCircle2,
  },
  PENDING: {
    label: "Awaiting confirmation",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: Clock,
  },
  COMPLETED: {
    label: "Shoot done",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: Camera,
  },
  DELIVERED: {
    label: "Delivered",
    badgeClass: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    icon: Sparkles,
  },
  NO_SHOW: {
    label: "No-show",
    badgeClass: "bg-zinc-800 text-zinc-400 border-zinc-700",
    icon: AlertCircle,
  },
  CANCELLED: {
    label: "Cancelled",
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    icon: AlertCircle,
  },
};

function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayHeading(date: string, today: string): string {
  if (!date) return "Date to be confirmed";
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return formatSlotDate(date, { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
}

const digitsOf = (phone: string) => phone.replace(/\D/g, "");

const chip =
  "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-750 text-xs font-mono text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors";

export function MySchedule({
  tenantSlug,
  tenantName = "Studio",
  tenantBio,
  currency = "USD",
  brandColor,
  days,
  past,
  today,
  openableProjects,
}: MyScheduleProps) {
  const [selectedSession, setSelectedSession] = useState<ScheduleSession | null>(null);
  const openable = new Set(openableProjects);
  const base = studioPath(tenantSlug, "/admin/schedule");

  const tab = (active: boolean) =>
    cn(
      "px-3 py-1.5 rounded-lg text-xs font-mono border",
      active
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold"
        : "text-zinc-400 border-transparent hover:text-white hover:bg-zinc-800/60"
    );

  return (
    <div className="space-y-6">
      {/* Navigation tabs */}
      <div className="flex items-center gap-1.5">
        <Link href={base} className={tab(!past)} aria-current={!past ? "page" : undefined}>
          Upcoming
        </Link>
        <Link href={`${base}?past=1`} className={tab(past)} aria-current={past ? "page" : undefined}>
          Past sessions
        </Link>
      </div>

      {days.length === 0 && (
        <p className="text-sm text-zinc-400">{past ? "No past sessions." : "Nothing assigned to you yet."}</p>
      )}

      {days.map((day) => (
        <section key={day.date || "tbc"} className="space-y-3">
          <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <span>{dayHeading(day.date, today)}</span>
            <span className="text-[11px] text-zinc-400">({day.sessions.length} sessions)</span>
          </h2>

          <ul className="space-y-3">
            {day.sessions.map((s) => {
              const digits = digitsOf(s.clientPhone);
              const statusCfg = STATUS_CONFIG[s.status] ?? {
                label: s.status,
                badgeClass: "bg-zinc-800 text-zinc-300 border-zinc-700",
                icon: Clock,
              };
              const StatusIcon = statusCfg.icon;
              const locationDisplay = s.callSheet?.locationName || tenantName;

              return (
                <li
                  key={s.bookingId}
                  className="p-5 rounded-2xl bg-[#121215] border border-zinc-800/90 shadow-sm hover:border-zinc-700 transition-all space-y-3.5 group"
                >
                  {/* Top Header Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-zinc-800/70">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-400 tabular-nums font-mono">
                        <CalendarClock className="size-4" aria-hidden="true" />
                        {s.startTime ? `${s.startTime} – ${s.endTime}` : "Time to be confirmed"}
                      </span>

                      {s.callSheet?.generalCallTime && (
                        <span className="text-xs font-mono text-zinc-400">
                          (Call: <strong className="text-amber-400">{s.callSheet.generalCallTime}</strong>)
                        </span>
                      )}

                      <span className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
                        #{s.trackingCode}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium border flex items-center gap-1 uppercase tracking-wide",
                          statusCfg.badgeClass
                        )}
                      >
                        <StatusIcon className="size-3" />
                        <span>{statusCfg.label}</span>
                      </span>

                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[11px] font-mono border uppercase",
                          s.depositPaid
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        )}
                      >
                        {s.depositPaid ? "Deposit Paid" : "Deposit Due"}
                      </span>
                    </div>
                  </div>

                  {/* Client & Scope Details */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setSelectedSession(s)}
                        className="text-base sm:text-lg font-black text-white hover:text-amber-400 transition-colors text-left"
                      >
                        {s.clientName}
                      </button>

                      <span className="text-xs font-mono text-zinc-400">
                        {[s.category.replace(/_/g, " ").toLowerCase(), s.packageName].filter(Boolean).join(" · ")}
                      </span>
                    </div>

                    {/* Location preview */}
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono pt-0.5">
                      <MapPin className="size-3.5 text-amber-400 flex-shrink-0" />
                      <span className="line-clamp-1">{locationDisplay}</span>
                    </div>

                    {/* Deliverables preview */}
                    {s.package?.deliverables && (
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                        <PackageIcon className="size-3.5 text-zinc-400 flex-shrink-0" />
                        <span>Deliverables: <strong className="text-zinc-200">{s.package.deliverables}</strong></span>
                        {s.package.turnaround && (
                          <span className="text-zinc-400 hidden sm:inline">({s.package.turnaround})</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Client Notes / Brief Callout */}
                  {s.brief && (
                    <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-xs text-zinc-300 leading-relaxed italic">
                      &ldquo;{s.brief}&rdquo;
                    </div>
                  )}

                  {/* Co-shooters / Crew */}
                  {s.others.length > 0 && (
                    <p className="text-xs text-zinc-400 font-mono">
                      Crew members: <span className="text-zinc-300">{s.others.join(", ")}</span>
                    </p>
                  )}

                  {/* Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800/60">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* View Shoot Details Button */}
                      <button
                        type="button"
                        onClick={() => setSelectedSession(s)}
                        className={cn(
                          buttonVariants({ variant: "secondary", size: "sm" }),
                          "h-8 text-xs font-mono border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 hover:text-white flex items-center gap-1.5"
                        )}
                      >
                        <Eye className="size-3.5 text-amber-400" />
                        <span>View Shoot Details</span>
                      </button>

                      {digits && (
                        <>
                          <a
                            href={`tel:${s.clientPhone.replace(/[^\d+]/g, "")}`}
                            className={chip}
                            title="Call client"
                          >
                            <Phone className="size-3.5 text-emerald-400" aria-hidden="true" />
                            <span>Call</span>
                          </a>

                          <a
                            href={`https://wa.me/${digits}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={chip}
                            title="Chat on WhatsApp"
                          >
                            <MessageCircle className="size-3.5 text-emerald-400" aria-hidden="true" />
                            <span>WhatsApp</span>
                          </a>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {s.projectId && openable.has(s.projectId) && (
                        <Link
                          href={studioPath(tenantSlug, `/admin/projects/${s.projectId}`)}
                          className={chip}
                          title="Open production project and upload deliverables"
                        >
                          <Images className="size-3.5 text-amber-400" aria-hidden="true" />
                          <span>Open gallery</span>
                        </Link>
                      )}

                      <Link
                        href={studioPath(tenantSlug, `/admin/schedule/${s.bookingId}`)}
                        className="text-[11px] font-mono text-zinc-400 hover:text-zinc-300 transition-colors hidden sm:inline-flex items-center gap-0.5"
                        title="Direct link to shoot page"
                      >
                        <span>Full Page</span>
                        <ExternalLink className="size-2.5" />
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* Interactive Shoot Details Modal */}
      {selectedSession && (
        <ShootDetailsDialog
          session={selectedSession}
          tenantSlug={tenantSlug}
          tenantName={tenantName}
          tenantBio={tenantBio}
          currency={currency}
          brandColor={brandColor}
          isOpen={true}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  );
}

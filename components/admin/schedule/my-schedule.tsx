import Link from "next/link";
import { Phone, MessageCircle, Images, CalendarClock } from "lucide-react";
import { formatSlotDate } from "@/lib/slot-time";
import { cn } from "@/lib/utils";
import type { ScheduleDay } from "@/lib/bookings/schedule";

interface MyScheduleProps {
  tenantSlug: string;
  days: ScheduleDay[];
  past: boolean;
  /** Studio today, YYYY-MM-DD. */
  today: string;
  /** Project ids this person may open ("Open gallery"). */
  openableProjects: string[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Awaiting confirmation",
  COMPLETED: "Shoot done",
  DELIVERED: "Delivered",
  NO_SHOW: "No-show",
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
  "inline-flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-700 text-[11px] font-mono text-zinc-300 hover:text-white hover:bg-zinc-800/60";

export function MySchedule({ tenantSlug, days, past, today, openableProjects }: MyScheduleProps) {
  const openable = new Set(openableProjects);
  const base = `/${tenantSlug}/admin/schedule`;
  const tab = (active: boolean) =>
    cn(
      "px-3 py-1.5 rounded-lg text-xs font-mono border",
      active ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold" : "text-zinc-400 border-transparent hover:text-white hover:bg-zinc-800/60"
    );

  return (
    <div className="space-y-6">
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
        <section key={day.date || "tbc"} className="space-y-2">
          <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">{dayHeading(day.date, today)}</h2>
          <ul className="space-y-2">
            {day.sessions.map((s) => {
              const digits = digitsOf(s.clientPhone);
              return (
                <li key={s.bookingId} className="p-4 rounded-xl bg-[#121215] border border-zinc-800/80 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400 tabular-nums">
                      <CalendarClock className="size-4" aria-hidden="true" />
                      {s.startTime ? `${s.startTime} – ${s.endTime}` : "Time to be confirmed"}
                    </span>
                    {s.status !== "CONFIRMED" && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {STATUS_LABELS[s.status] ?? s.status}
                      </span>
                    )}
                  </div>
                  <div className="text-base font-bold text-white">{s.clientName}</div>
                  <div className="text-xs text-zinc-400">
                    {[s.category.replace(/_/g, " ").toLowerCase(), s.packageName].filter(Boolean).join(" · ")}
                  </div>
                  {s.brief && <p className="text-sm text-zinc-300 whitespace-pre-wrap">{s.brief}</p>}
                  {s.others.length > 0 && <p className="text-xs text-zinc-500">With: {s.others.join(", ")}</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {digits && (
                      <>
                        <a href={`tel:${s.clientPhone.replace(/[^\d+]/g, "")}`} className={chip}>
                          <Phone className="size-3.5" aria-hidden="true" /> Call
                        </a>
                        <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" className={chip}>
                          <MessageCircle className="size-3.5" aria-hidden="true" /> WhatsApp
                        </a>
                      </>
                    )}
                    {s.projectId && openable.has(s.projectId) && (
                      <Link href={`/${tenantSlug}/admin/projects/${s.projectId}`} className={chip}>
                        <Images className="size-3.5" aria-hidden="true" /> Open gallery
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

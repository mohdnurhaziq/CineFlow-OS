"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { monthGrid, shiftMonth, type DaySummary } from "@/lib/calendar/month-grid";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const monthLabel = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

const dayLabel = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** What a day holds, in words, for screen readers and the tooltip. */
function describe(key: string, s: DaySummary | undefined): string {
  if (!s) return `${dayLabel(key)}: no slots`;
  const parts = [
    s.open && `${s.open} open`,
    s.booked && `${s.booked} booked`,
    s.waiting && `${s.waiting} waiting`,
    s.blocked && `${s.blocked} blocked`,
  ].filter(Boolean);
  return `${dayLabel(key)}: ${parts.join(", ")}`;
}

interface MonthViewProps {
  shown: { year: number; month: number };
  onShowMonth: (shown: { year: number; month: number }) => void;
  summaries: Map<string, DaySummary>;
  selectedDay: string;
  onSelectDay: (day: string) => void;
  /** Today in the studio's time zone (YYYY-MM-DD). */
  today: string;
}

/**
 * A month of days, each showing how many slots are open (green), booked (purple), waiting for
 * checkout or a payment check (amber) and blocked (grey). Choosing a day shows its slots beside it.
 */
export function MonthView({ shown, onShowMonth, summaries, selectedDay, onSelectDay, today }: MonthViewProps) {
  const weeks = monthGrid(shown.year, shown.month);
  const todayMonth = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
  const onTodayMonth = shown.year === todayMonth.year && shown.month === todayMonth.month;

  return (
    <section aria-label="Month" className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onShowMonth(shiftMonth(shown, -1))}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-white truncate">{monthLabel(shown.year, shown.month)}</h2>
          {!onTodayMonth && (
            <button
              type="button"
              onClick={() => {
                onShowMonth(todayMonth);
                onSelectDay(today);
              }}
              className="text-[11px] font-mono text-amber-400 hover:underline"
            >
              Today
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onShowMonth(shiftMonth(shown, 1))}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div role="grid" aria-label={monthLabel(shown.year, shown.month)} className="space-y-1">
        <div role="row" className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <div key={d} role="columnheader" className="text-center text-[10px] font-mono uppercase tracking-wider text-zinc-500 py-1">
              {d.slice(0, 2)}
            </div>
          ))}
        </div>
        {weeks.map((week, w) => (
          <div key={w} role="row" className="grid grid-cols-7 gap-1">
            {week.map((key, i) => {
              if (!key) return <div key={i} role="gridcell" aria-hidden="true" />;
              const s = summaries.get(key);
              const selected = key === selectedDay;
              const isToday = key === today;
              const past = key < today;
              return (
                <div key={key} role="gridcell">
                  <button
                    type="button"
                    onClick={() => onSelectDay(key)}
                    aria-pressed={selected}
                    aria-label={describe(key, s)}
                    title={describe(key, s)}
                    className={cn(
                      "w-full aspect-square sm:aspect-[1/0.9] rounded-lg border flex flex-col items-center justify-start gap-1 pt-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                      selected
                        ? "border-amber-500/70 bg-amber-500/10"
                        : s
                          ? "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
                          : "border-transparent hover:border-zinc-800",
                      past && !selected && "opacity-50"
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-mono tabular-nums leading-none",
                        isToday ? "text-amber-400 font-bold" : s ? "text-zinc-100" : "text-zinc-500"
                      )}
                    >
                      {Number(key.slice(8))}
                    </span>
                    {s && (
                      <span className="flex flex-wrap justify-center gap-x-1 gap-y-0.5 px-0.5" aria-hidden="true">
                        {s.open > 0 && <Count value={s.open} className="bg-emerald-400" />}
                        {s.booked > 0 && <Count value={s.booked} className="bg-purple-400" />}
                        {s.waiting > 0 && <Count value={s.waiting} className="bg-amber-400" />}
                        {s.blocked > 0 && <Count value={s.blocked} className="bg-zinc-500" />}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[10px] font-mono text-zinc-400" aria-hidden="true">
        <Legend className="bg-emerald-400" label="Open" />
        <Legend className="bg-purple-400" label="Booked" />
        <Legend className="bg-amber-400" label="Held / to check" />
        <Legend className="bg-zinc-500" label="Blocked" />
      </div>
    </section>
  );
}

function Count({ value, className }: { value: number; className: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono tabular-nums text-zinc-300 leading-none">
      <span className={cn("size-1.5 rounded-full", className)} />
      {value}
    </span>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-1.5 rounded-full", className)} />
      {label}
    </span>
  );
}

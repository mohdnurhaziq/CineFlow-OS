import { isSlotInPast, minutesOfDay, slotDateKey } from "@/lib/slot-time";

/**
 * The admin Calendar's month view: the grid of days, slots in time order, and what each day shows.
 * Slot days are calendar days (stored as midnight UTC, see lib/slot-time). Safe on server and client.
 */

type SlotLike = { date: Date | string; startTime: string; status: string };

/** By day, then by start time as a time ("09:00 AM" before "02:00 PM"); unreadable times last. */
export function compareSlots(a: SlotLike, b: SlotLike): number {
  const day = slotDateKey(a.date).localeCompare(slotDateKey(b.date));
  if (day !== 0) return day;
  return (minutesOfDay(a.startTime) ?? 24 * 60) - (minutesOfDay(b.startTime) ?? 24 * 60);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The weeks of a month (month 0-11), Monday first: seven cells each, a YYYY-MM-DD or null outside the month. */
export function monthGrid(year: number, month: number): Array<Array<string | null>> {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const cells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** The month before or after, across year ends. */
export function shiftMonth(at: { year: number; month: number }, by: number): { year: number; month: number } {
  const total = at.year * 12 + at.month + by;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export interface DaySummary {
  total: number;
  /** Clients can still book it. */
  open: number;
  booked: number;
  /** Held at checkout, or a payment waiting for the studio's check. */
  waiting: number;
  blocked: number;
}

/**
 * Per day (YYYY-MM-DD): how many slots, and how many open, booked, waiting and blocked. A slot whose
 * start time has passed (at `now`, in the studio's time zone) is no longer open: nobody can book it.
 */
export function daySummaries(slots: SlotLike[], now: Date = new Date()): Map<string, DaySummary> {
  const out = new Map<string, DaySummary>();
  for (const s of slots) {
    const key = slotDateKey(s.date);
    const d = out.get(key) ?? { total: 0, open: 0, booked: 0, waiting: 0, blocked: 0 };
    d.total += 1;
    if (s.status === "AVAILABLE") {
      if (!isSlotInPast(s, now)) d.open += 1;
    }
    else if (s.status === "BOOKED") d.booked += 1;
    else if (s.status === "HELD" || s.status === "PENDING_VERIFICATION") d.waiting += 1;
    else if (s.status === "BLOCKED") d.blocked += 1;
    out.set(key, d);
  }
  return out;
}

/** The day the calendar opens on: today if it has slots, else the next day that does, else today. */
export function defaultCalendarDay(slots: SlotLike[], today: string): string {
  const upcoming = slots.map((s) => slotDateKey(s.date)).filter((d) => d >= today).sort();
  return upcoming[0] ?? today;
}

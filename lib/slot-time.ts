/**
 * The studio's calendar and clock: time helpers for booking slots, and the one way dates are
 * worked out and written. The server runs on UTC, so "today", "this year" and any displayed date
 * must come from here, never from the computer's own clock.
 *
 * A slot stores its calendar day in `date` (midnight UTC of that day) and its
 * local start time as text such as "09:00 AM". Both are in the studio's local
 * time, so "now" must be read in the studio's time zone, not the server's
 * (production servers usually run on UTC).
 *
 * Safe to import from both server and client code.
 */

/** Studio time zone. Studios have no per-tenant setting yet, so one zone applies platform-wide. */
export const STUDIO_TIME_ZONE = process.env.STUDIO_TIME_ZONE || "Asia/Kuala_Lumpur";

/**
 * Minutes since midnight for "09:00 AM", "9:30 pm", "12:15 PM" or 24-hour "21:00".
 * Returns null when the text isn't a recognisable time.
 */
export function minutesOfDay(time: string): number | null {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3]?.toUpperCase();
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = hours % 12;
    if (meridiem === "PM") hours += 12;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

/** The slot's calendar day as YYYY-MM-DD. */
export function slotDateKey(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

/** The current calendar day and minute of the day in the studio's time zone. */
export function studioNow(now: Date = new Date(), timeZone: string = STUDIO_TIME_ZONE): { dateKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** True once the slot's start time has passed in the studio's time zone. */
export function isSlotInPast(
  slot: { date: Date | string; startTime: string },
  now: Date = new Date(),
  timeZone: string = STUDIO_TIME_ZONE
): boolean {
  const today = studioNow(now, timeZone);
  const day = slotDateKey(slot.date);
  if (day !== today.dateKey) return day < today.dateKey;
  const start = minutesOfDay(slot.startTime);
  // An unreadable start time on today's date counts as started, so it can't be booked late.
  return start === null || start <= today.minutes;
}

export type SessionBlock = "morning" | "afternoon" | "evening";

/** Morning before 12:00 PM, afternoon until 5:00 PM, evening from 5:00 PM. */
export function sessionBlock(time: string): SessionBlock {
  const minutes = minutesOfDay(time) ?? 0;
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  return "evening";
}

/** A timestamp (paid at, issued at, due at…) as a studio-local calendar date, e.g. "13 Nov 2026". */
export function formatStudioDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: STUDIO_TIME_ZONE });
}

/**
 * Formats a slot's calendar day. Slot dates are stored as midnight UTC, so they are
 * formatted in UTC; formatting in the viewer's zone would show the previous day west of UTC.
 */
export function formatSlotDate(date: Date | string, options: Intl.DateTimeFormatOptions, locale = "en-GB"): string {
  return new Date(date).toLocaleDateString(locale, { ...options, timeZone: "UTC" });
}

/** A moment with its time, studio-local: "13 Nov 2026, 14:05". */
export function formatStudioDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: STUDIO_TIME_ZONE });
}

/** A shoot or session day (stored as midnight UTC, or as "YYYY-MM-DD"): "Fri, 27 Nov 2026". */
export function formatDay(day: Date | string): string {
  return formatSlotDate(day, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** The studio's today as "YYYY-MM-DD", or the day `offsetDays` after it (1 = tomorrow). */
export function studioDateKey(offsetDays = 0, now: Date = new Date()): string {
  const today = new Date(`${studioNow(now).dateKey}T00:00:00.000Z`);
  today.setUTCDate(today.getUTCDate() + offsetDays);
  return today.toISOString().slice(0, 10);
}

/** The studio's today in the form calendar days are stored in (midnight UTC), for comparing with them. */
export function studioTodayStart(now: Date = new Date()): Date {
  return new Date(`${studioDateKey(0, now)}T00:00:00.000Z`);
}

/** The studio's current year, for invoice, order, project and proposal numbers. */
export function studioYear(now: Date = new Date()): number {
  return Number(studioDateKey(0, now).slice(0, 4));
}

/** Whether a due date's day has fully passed for the studio. On the due day itself, nothing is late. */
export function isPastDue(due: Date | string, now: Date = new Date()): boolean {
  return studioNow(new Date(due)).dateKey < studioNow(now).dateKey;
}

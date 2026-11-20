import { minutesOfDay, slotDateKey, STUDIO_TIME_ZONE } from "@/lib/slot-time";

/**
 * Calendar invites (iCalendar, RFC 5545) for shoots: the client's and each shooter's copy of a
 * session. Sent by email (lib/notifications.ts): Gmail shows the event and puts it in Google
 * Calendar; Apple and Outlook offer "Add to calendar". REQUEST adds or updates the event (the same
 * UID with a higher SEQUENCE), CANCEL removes it. Server code (uses Buffer to count bytes).
 */

export type CalendarInvite = {
  method: "REQUEST" | "CANCEL";
  ics: string;
  /** REQUEST only: adds the event by hand in Google Calendar, for mail apps that show only the file. */
  googleUrl?: string;
};

export interface InviteEvent {
  /** One per booking and person: the same UID updates or cancels that person's event. */
  uid: string;
  /** Must rise with every change (see inviteSequence). */
  sequence: number;
  title: string;
  description: string;
  start: Date;
  end: Date;
  organizerName: string;
  organizerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
  url?: string;
}

let lastSequence = 0;

/**
 * Quarter-seconds since 1 Jan 2026, and always above the last one this server gave out: every later
 * change gets a higher number, even two in the same moment, with nothing to store. Stays within a
 * calendar's 32-bit limit until 2043.
 */
export function inviteSequence(now: Date = new Date()): number {
  const fromClock = Math.max(1, Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 250));
  lastSequence = Math.max(fromClock, lastSequence + 1);
  return lastSequence;
}

/** The UTC instant of a wall-clock time (YYYY-MM-DD, minutes of the day) in `timeZone`. */
function zonedToUtc(dateKey: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // The zone's offset at that moment: format the guess in the zone and compare. Twice, for the
  // rare case of a daylight-saving change between the guess and the answer.
  let utc = wall;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utc));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    utc += wall - shown;
  }
  return new Date(utc);
}

/** A slot's start and end as instants, from its day and times in the studio's zone; null if unreadable. */
export function slotTimes(
  slot: { date: Date | string; startTime: string; endTime: string },
  timeZone: string = STUDIO_TIME_ZONE
): { start: Date; end: Date } | null {
  const start = minutesOfDay(slot.startTime);
  const end = minutesOfDay(slot.endTime);
  if (start === null || end === null) return null;
  const day = slotDateKey(slot.date);
  const startAt = zonedToUtc(day, start, timeZone);
  // The same start and end time: an hour, not a whole day. An end before the start: past midnight.
  if (end === start) return { start: startAt, end: new Date(startAt.getTime() + 3600 * 1000) };
  const endAt = zonedToUtc(day, end, timeZone);
  return { start: startAt, end: end > start ? endAt : new Date(endAt.getTime() + 24 * 3600 * 1000) };
}

const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Line breaks of any kind become "\n"; other control characters, which iCalendar forbids, are dropped. */
const clean = (value: string) => value.replace(/\r\n|\r/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");

/** TEXT values: backslash, semicolon, comma and new lines escaped. */
const text = (value: string) =>
  clean(value).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** A parameter value (a name): quoted, with characters that can't appear removed. */
const param = (value: string) => `"${clean(value).replace(/["\n]/g, "").trim()}"`;

/** Lines longer than 75 bytes continue on the next line after a space (never splitting a character). */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildInvite(event: InviteEvent, method: "REQUEST" | "CANCEL"): CalendarInvite {
  const cancel = method === "CANCEL";
  const alarm = (trigger: string) => [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${text(event.title)}`,
    `TRIGGER:${trigger}`,
    "END:VALARM",
  ];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CineFlow OS//Shoot reminders//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(event.start)}`,
    `DTEND:${utcStamp(event.end)}`,
    `SUMMARY:${text(event.title)}`,
    `DESCRIPTION:${text(event.url && !event.description.includes(event.url) ? `${event.description}\n\n${event.url}` : event.description)}`,
    ...(event.url ? [`URL:${event.url}`] : []),
    `ORGANIZER;CN=${param(event.organizerName)}:mailto:${event.organizerEmail}`,
    `ATTENDEE;CN=${param(event.attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${event.attendeeEmail}`,
    `STATUS:${cancel ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    ...(cancel ? [] : [...alarm("-P1D"), ...alarm("-PT1H")]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const ics = `${lines.map(fold).join("\r\n")}\r\n`;
  if (cancel) return { method, ics };
  const details = event.url && !event.description.includes(event.url) ? `${event.description}\n\n${event.url}` : event.description;
  const google = new URLSearchParams({
    action: "TEMPLATE",
    text: clean(event.title),
    dates: `${utcStamp(event.start)}/${utcStamp(event.end)}`,
    details: clean(details),
  });
  return { method, ics, googleUrl: `https://calendar.google.com/calendar/render?${google.toString()}` };
}

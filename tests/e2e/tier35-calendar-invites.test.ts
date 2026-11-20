/**
 * Tier 35: Shoot reminders in the calendar (docs/superpowers/specs/2026-11-20-calendar-invites-design.md)
 * Confirmed bookings put the session in the client's and each shooter's calendar by email invite,
 * with reminders a day and an hour before; moves update it and cancellations remove it.
 */

import { TestHarness } from "./test-harness";
import { buildInvite, inviteSequence, slotTimes, type InviteEvent } from "@/lib/calendar/ics";

/** The ics with folded lines joined back, for reading values. */
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");

export async function runTier35CalendarInvitesTests(harness: TestHarness) {
  harness.setSuite("Tier 35", "Shoot reminders in the calendar");

  const slot = { date: new Date("2026-12-05T00:00:00.000Z"), startTime: "10:00 AM", endTime: "12:30 PM" };
  const event = (over: Partial<InviteEvent> = {}): InviteEvent => {
    const times = slotTimes(slot, "Asia/Kuala_Lumpur")!;
    return {
      uid: "booking-b1-client@cineflow-os",
      sequence: 7,
      title: "Photo session with Lumina CineWorks",
      description: "Package: Wedding\nRef: BK-1",
      start: times.start,
      end: times.end,
      organizerName: "Lumina CineWorks",
      organizerEmail: "noreply@cineflow-os.app",
      attendeeName: "Farah",
      attendeeEmail: "farah@example.test",
      url: "https://lumina-cine.cineflow-os.app/account",
      ...over,
    };
  };

  await harness.test("T35-ICS-01: session times come from the studio's clock and are written in UTC", async () => {
    const t = slotTimes(slot, "Asia/Kuala_Lumpur");
    harness.assertEqual(t?.start.toISOString(), "2026-12-05T02:00:00.000Z", "10:00 AM in Kuala Lumpur is 02:00 UTC");
    harness.assertEqual(t?.end.toISOString(), "2026-12-05T04:30:00.000Z", "12:30 PM is 04:30 UTC");
    harness.assertEqual(slotTimes({ ...slot, startTime: "21:00", endTime: "22:15" }, "Asia/Kuala_Lumpur")?.start.toISOString(), "2026-12-05T13:00:00.000Z", "24-hour times work");
    harness.assertEqual(slotTimes({ ...slot, startTime: "soon" }, "Asia/Kuala_Lumpur"), null, "An unreadable time gives no invite");
    const ics = unfold(buildInvite(event(), "REQUEST").ics);
    harness.assert(ics.includes("DTSTART:20261205T020000Z") && ics.includes("DTEND:20261205T043000Z"), "Written in UTC", ics);
  });

  await harness.test("T35-ICS-02: a valid invite: reminders, no replies asked, text escaped, lines folded", async () => {
    const invite = buildInvite(
      event({ title: "Shoot: Farah, Ali; and 👰 bride", description: "Line one\nLine two; with, punctuation \\ and a long tail ".repeat(4) }),
      "REQUEST"
    );
    harness.assertEqual(invite.method, "REQUEST", "Method");
    const raw = invite.ics;
    const ics = unfold(raw);
    for (const part of ["BEGIN:VCALENDAR", "VERSION:2.0", "METHOD:REQUEST", "BEGIN:VEVENT", "UID:booking-b1-client@cineflow-os", "SEQUENCE:7", "STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR"]) {
      harness.assert(ics.includes(part), `Has ${part}`);
    }
    harness.assert(ics.includes("TRIGGER:-P1D") && ics.includes("TRIGGER:-PT1H"), "Reminders a day and an hour before");
    harness.assert(/ATTENDEE;[^\r\n]*RSVP=FALSE[^\r\n]*:mailto:farah@example\.test/.test(ics), "The recipient, with no reply asked", ics);
    harness.assert(/ORGANIZER;CN="?Lumina CineWorks"?:mailto:noreply@cineflow-os\.app/.test(ics), "Organised by the studio");
    harness.assert(ics.includes("SUMMARY:Shoot: Farah\\, Ali\\; and 👰 bride"), "Commas and semicolons escaped", ics);
    harness.assert(ics.includes("Line one\\nLine two\\; with\\, punctuation \\\\ and"), "New lines and backslashes escaped");
    harness.assert(raw.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75), "No line longer than 75 bytes");
    harness.assert(!/[^\r]\n/.test(raw), "Lines end in CRLF");
  });

  await harness.test("T35-ICS-03: a cancellation removes the same event; later changes have higher numbers", async () => {
    const ics = unfold(buildInvite(event(), "CANCEL").ics);
    harness.assert(ics.includes("METHOD:CANCEL") && ics.includes("STATUS:CANCELLED"), "Cancelled");
    harness.assert(ics.includes("UID:booking-b1-client@cineflow-os"), "The same event");
    const a = inviteSequence(new Date("2026-11-20T00:00:00Z"));
    const b = inviteSequence(new Date("2026-11-20T00:00:05Z"));
    harness.assert(Number.isInteger(a) && b > a && a > 0, "The sequence rises with time", `${a} ${b}`);
  });
}

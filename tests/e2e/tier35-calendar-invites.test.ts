/**
 * Tier 35: Shoot reminders in the calendar (docs/superpowers/specs/2026-11-20-calendar-invites-design.md)
 * Confirmed bookings put the session in the client's and each shooter's calendar by email invite,
 * with reminders a day and an hour before; moves update it and cancellations remove it.
 */

import { TestHarness } from "./test-harness";
import nodemailer, { type Transporter } from "nodemailer";
import { buildInvite, inviteSequence, slotTimes, type InviteEvent } from "@/lib/calendar/ics";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import { platformSenderAddress, sendNotification, type NotificationPayload } from "@/lib/notifications";
import { db } from "@/lib/db";
import { withSession } from "./mocks/session";
import { processBookingCheckout } from "@/lib/actions/checkout";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { cancelBooking, rescheduleBooking } from "@/lib/actions/admin-booking-lifecycle";
import { sendBookingConfirmation } from "@/lib/bookings/confirmation-email";
import { clientInvite } from "@/lib/bookings/calendar-invites";
import { assignTeamMember, unassignTeamMember } from "@/lib/actions/admin-assignments";

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

  // ---- Emails carry the invite (both email routes) ----
  const MAIL_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_ADDRESS", "RESEND_API_KEY", "RESEND_FROM_EMAIL"] as const;
  const savedMail = Object.fromEntries(MAIL_KEYS.map((k) => [k, process.env[k]]));
  const realFetch = globalThis.fetch;
  const restoreMail = () => {
    for (const k of MAIL_KEYS) {
      if (savedMail[k] === undefined) delete process.env[k];
      else process.env[k] = savedMail[k];
    }
    setSmtpTransportForTests(null);
    globalThis.fetch = realFetch;
  };
  const confirmedPayload = (calendar?: ReturnType<typeof buildInvite>): NotificationPayload => ({
    event: "BOOKING_CONFIRMED",
    studioName: "Lumina CineWorks",
    studioSlug: "lumina-cine",
    clientName: "Farah",
    clientEmail: "farah@example.test",
    packageName: "Wedding",
    slotDate: "Sat, 5 Dec 2026",
    startTime: "10:00 AM",
    endTime: "12:30 PM",
    depositAmount: 300,
    currency: "MYR",
    depositPaid: true,
    calendar,
  });

  await harness.test("T35-MAIL-01: over SMTP the email carries the invite as a calendar part", async () => {
    try {
      for (const k of MAIL_KEYS) delete process.env[k];
      process.env.SMTP_HOST = "mailpit";
      process.env.SMTP_PORT = "1025";
      process.env.SMTP_FROM_ADDRESS = "bookings@studio.test";
      type Sent = { icalEvent?: { method?: string; filename?: string; content?: string }; built: string };
      const sent: Sent[] = [];
      const json = nodemailer.createTransport({ jsonTransport: true });
      setSmtpTransportForTests({
        sendMail: async (mail: Sent) => {
          const info = await json.sendMail(mail);
          sent.push({ ...mail, built: String((info as { message?: unknown }).message ?? "") });
          return info;
        },
      } as unknown as Transporter);

      harness.assertEqual(platformSenderAddress(), "bookings@studio.test", "The organiser address is the SMTP sender");
      const invite = buildInvite(event({ organizerEmail: platformSenderAddress() }), "REQUEST");
      const r = await sendNotification(confirmedPayload(invite), "EMAIL");
      harness.assertEqual(r.emailDelivery, "SENT", "Sent");
      harness.assertEqual(sent[0]?.icalEvent?.method, "REQUEST", "Calendar part with the method");
      harness.assertEqual(sent[0]?.icalEvent?.filename, "invite.ics", "Named invite.ics");
      harness.assertEqual(sent[0]?.icalEvent?.content, invite.ics, "The invite itself");
      harness.assertEqual(r.calendar?.method, "REQUEST", "The send record says an invite went with it");

      await sendNotification(confirmedPayload(), "EMAIL");
      harness.assertEqual(sent[1]?.icalEvent, undefined, "No invite, no calendar part");
    } finally {
      restoreMail();
    }
  });

  await harness.test("T35-MAIL-02: through Resend the invite is an invite.ics attachment", async () => {
    try {
      for (const k of MAIL_KEYS) delete process.env[k];
      process.env.RESEND_API_KEY = "re_test_key";
      process.env.RESEND_FROM_EMAIL = "CineFlow OS <noreply@cineflow-os.app>";
      const bodies: Record<string, unknown>[] = [];
      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
      }) as typeof fetch;

      harness.assertEqual(platformSenderAddress(), "noreply@cineflow-os.app", "The organiser address is the Resend sender");
      const invite = buildInvite(event(), "CANCEL");
      await sendNotification(confirmedPayload(invite), "EMAIL");
      const att = (bodies[0]?.attachments as Array<{ filename: string; content: string; content_type: string }> | undefined)?.[0];
      harness.assertEqual(att?.filename, "invite.ics", "Named invite.ics");
      harness.assert(Boolean(att?.content_type?.startsWith("text/calendar; method=CANCEL")), "Calendar content type with the method", att?.content_type);
      harness.assertEqual(Buffer.from(att?.content ?? "", "base64").toString("utf8"), invite.ics, "The invite itself, base64");

      await sendNotification(confirmedPayload(), "EMAIL");
      harness.assertEqual(bodies[1]?.attachments, undefined, "No invite, no attachment");

      delete process.env.RESEND_FROM_EMAIL;
      harness.assertEqual(platformSenderAddress(), "noreply@cineflow-os.my", "Falls back to the platform address");
    } finally {
      restoreMail();
    }
  });

  // ---- The client's invite, from real booking actions ----
  const DAY_MS = 86_400_000;
  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  if (!lumina) throw new Error("Seed tenant lumina-cine is required");
  const ownerRow = await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  if (!ownerRow) throw new Error("Seed Lumina owner is required");
  const owner = { id: ownerRow.id, email: ownerRow.email, name: ownerRow.name, role: ownerRow.role, tenantId: ownerRow.tenantId, tenantSlug: "lumina-cine" };
  const run = Date.now().toString(36);
  const slotIds: string[] = [];
  harness.registerTeardown(async () => {
    await db.bookingAssignment.deleteMany({ where: { booking: { clientEmail: { startsWith: "t35-" } } } });
    await db.milestoneInvoice.deleteMany({ where: { client: { email: { startsWith: "t35-" } } } });
    await db.project.deleteMany({ where: { client: { email: { startsWith: "t35-" } } } });
    await db.clientBooking.deleteMany({ where: { clientEmail: { startsWith: "t35-" } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: slotIds } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t35-" } } });
  });

  // Every email these tests cause goes through a capturing SMTP transport.
  type Mail = { to: string; subject: string; icalEvent?: { method: string; content: string } };
  const mails: Mail[] = [];
  const captureMail = () => {
    for (const k of MAIL_KEYS) delete process.env[k];
    process.env.SMTP_HOST = "mailpit";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_FROM_ADDRESS = "noreply@cineflow-os.app";
    setSmtpTransportForTests({
      sendMail: async (mail: Mail) => {
        mails.push(mail);
        return { messageId: "t35" };
      },
    } as unknown as Transporter);
  };
  /** The emails to `to`, once `count` of them have arrived (some are sent in the background). */
  const mailTo = async (to: string, count = 1): Promise<Mail[]> => {
    for (let i = 0; i < 40 && mails.filter((m) => m.to === to).length < count; i++) await new Promise((r) => setTimeout(r, 50));
    return mails.filter((m) => m.to === to);
  };
  const invitesTo = async (to: string, count: number) => {
    for (let i = 0; i < 40 && mails.filter((m) => m.to === to && m.icalEvent).length < count; i++) await new Promise((r) => setTimeout(r, 50));
    return mails.filter((m) => m.to === to && m.icalEvent).map((m) => m.icalEvent!);
  };
  const seqOf = (ics: string) => Number(unfold(ics).match(/SEQUENCE:(\d+)/)?.[1] ?? 0);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  let minute = 0;
  const makeSlot = async (daysAhead: number) => {
    minute += 1;
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        category: "EDITORIAL",
        date: new Date(`${new Date(Date.now() + daysAhead * DAY_MS).toISOString().slice(0, 10)}T00:00:00.000Z`),
        startTime: `0${(minute % 8) + 1}:00 PM`,
        endTime: `0${(minute % 8) + 1}:45 PM`,
        status: "AVAILABLE",
        price: 400,
        depositRequired: 100,
      },
    });
    slotIds.push(slot.id);
    return slot;
  };
  let seq = 0;
  /** A QR booking awaiting the studio's check of the slip. */
  const book = async (slotId: string) => {
    seq += 1;
    const email = `t35-client-${run}-${seq}@example.test`;
    const res = await withSession(null, () =>
      processBookingCheckout({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId,
        sessionId: `t35-${run}-${seq}`,
        clientName: "Farah, Calendar",
        clientEmail: email,
        clientPhone: "0123456789",
        paymentMethod: "QR_CODE",
        paymentProofUrl: "/uploads/receipts/t35.jpg",
      })
    );
    if (!res.success) throw new Error(`T35 booking failed: ${res.message}`);
    return { bookingId: res.bookingId as string, invoiceId: res.invoiceId as string, email };
  };
  const approve = (invoiceId: string) =>
    withSession(owner, () => approvePaymentVerification({ invoiceId, tenantId: lumina.id, tenantSlug: "lumina-cine" }));
  const ids = (bookingId: string) => ({ tenantId: lumina.id, tenantSlug: "lumina-cine", bookingId });

  await harness.test("T35-BOOK-01: approving the deposit sends the client the session as a calendar invite", async () => {
    captureMail();
    try {
      const slot = await makeSlot(30);
      const b = await book(slot.id);
      await approve(b.invoiceId);
      const [invite] = await invitesTo(b.email, 1);
      harness.assertEqual(invite?.method, "REQUEST", "The client gets an invite", JSON.stringify((await mailTo(b.email)).map((m) => m.subject)));
      const confirmed = mails.find((m) => m.to === b.email && m.icalEvent);
      harness.assert(/confirmed/i.test(confirmed?.subject ?? ""), "In the booking-confirmed email", confirmed?.subject);
      const ics = unfold(invite?.content ?? "");
      harness.assert(ics.includes(`UID:booking-${b.bookingId}-client@cineflow-os`), "The client's event for this booking", ics);
      harness.assert(ics.includes(`DTSTART:${stamp(slotTimes(slot)!.start)}`), "At the session's time");
      harness.assert(ics.includes("SUMMARY:Photo session with Lumina"), "Titled for the studio", ics);
      harness.assert(ics.includes(`mailto:${b.email}`), "Addressed to the client");
      harness.assert(ics.includes("/account"), "Links to their account");
      const description = ics.match(/^DESCRIPTION:(.*)$/m)?.[1] ?? "";
      harness.assertEqual(description.split("/lumina-cine/account").length - 1, 1, "The link appears once in the description", description);
    } finally {
      restoreMail();
    }
  });

  await harness.test("T35-BOOK-02: no invite for a booking that isn't confirmed, or has no session time", async () => {
    captureMail();
    try {
      const slot = await makeSlot(31);
      const b = await book(slot.id);
      await sendBookingConfirmation(b.bookingId);
      const sent = await mailTo(b.email, 2);
      harness.assert(sent.length >= 1 && sent.every((m) => !m.icalEvent), "Booking-received emails carry no invite", JSON.stringify(sent.map((m) => m.subject)));
      harness.assertEqual(await clientInvite(b.bookingId, "REQUEST"), null, "Pending: no invite");

      await approve(b.invoiceId);
      await db.clientBooking.update({ where: { id: b.bookingId }, data: { slotId: null, targetDate: "2026-12-24" } });
      harness.assertEqual(await clientInvite(b.bookingId, "REQUEST"), null, "Confirmed but no slot: no invite, no error");
      harness.assertEqual(await clientInvite("no-such-booking", "REQUEST"), null, "Unknown booking: no invite");
    } finally {
      restoreMail();
    }
  });

  await harness.test("T35-BOOK-03: moving the booking updates the client's event; cancelling removes it", async () => {
    captureMail();
    try {
      const from = await makeSlot(32);
      const to = await makeSlot(33);
      const b = await book(from.id);
      await approve(b.invoiceId);
      const [first] = await invitesTo(b.email, 1);
      await new Promise((r) => setTimeout(r, 1100)); // the sequence counts seconds

      const moved = await withSession(owner, () => rescheduleBooking({ ...ids(b.bookingId), newSlotId: to.id }));
      harness.assert(moved.success === true, "Moved", JSON.stringify(moved));
      const update = (await invitesTo(b.email, 2))[1];
      const uid = `UID:booking-${b.bookingId}-client@cineflow-os`;
      harness.assertEqual(update?.method, "REQUEST", "An update");
      harness.assert(unfold(update?.content ?? "").includes(uid), "The same event");
      harness.assert(seqOf(update?.content ?? "") > seqOf(first?.content ?? ""), "A higher sequence");
      harness.assert(unfold(update?.content ?? "").includes(`DTSTART:${stamp(slotTimes(to)!.start)}`), "At the new time");

      await new Promise((r) => setTimeout(r, 1100));
      const cancelled = await withSession(owner, () => cancelBooking({ ...ids(b.bookingId), reason: "Client asked" }));
      harness.assert(cancelled.success === true, "Cancelled", JSON.stringify(cancelled));
      const cancel = (await invitesTo(b.email, 3))[2];
      harness.assertEqual(cancel?.method, "CANCEL", "A cancellation");
      harness.assert(unfold(cancel?.content ?? "").includes(uid), "Of the same event");
      harness.assert(seqOf(cancel?.content ?? "") > seqOf(update?.content ?? ""), "With a higher sequence still");
    } finally {
      restoreMail();
    }
  });

  // ---- The shooters' invites ----
  const mkShooter = async (label: string) =>
    db.user.create({
      data: { tenantId: lumina.id, email: `t35-shooter-${label}-${run}@example.test`, name: `T35 ${label}`, role: "TEAM_MEMBER", passwordHash: "x" },
    });
  const assign = (bookingId: string, userId: string) =>
    withSession(owner, () => assignTeamMember({ tenantId: lumina.id, tenantSlug: "lumina-cine", bookingIds: [bookingId], userId }));
  const shooterUid = (bookingId: string, userId: string) => `UID:booking-${bookingId}-shooter-${userId}@cineflow-os`;

  await harness.test("T35-SHOOT-01: a shooter put on a confirmed shoot gets it in their calendar; not on a pending one", async () => {
    captureMail();
    try {
      const slot = await makeSlot(40);
      const b = await book(slot.id);
      await approve(b.invoiceId);
      const s = await mkShooter("a");
      const res = await assign(b.bookingId, s.id);
      harness.assert(res.success === true, "Assigned", JSON.stringify(res));
      const [invite] = await invitesTo(s.email, 1);
      harness.assertEqual(invite?.method, "REQUEST", "The shooter gets an invite");
      const mail = mails.find((m) => m.to === s.email && m.icalEvent);
      harness.assert(/^New shoot: /.test(mail?.subject ?? ""), "In the assignment email", mail?.subject);
      const ics = unfold(invite?.content ?? "");
      harness.assert(ics.includes(shooterUid(b.bookingId, s.id)), "The shooter's own event", ics);
      harness.assert(ics.includes("SUMMARY:Shoot: Farah\\, Calendar"), "Titled with the client", ics);
      harness.assert(ics.includes("0123456789"), "With the client's phone");
      harness.assert(ics.includes(`/admin/bookings/${b.bookingId}`), "Links to the booking in the admin");
      harness.assert(ics.includes(`DTSTART:${stamp(slotTimes(slot)!.start)}`), "At the session's time");
      harness.assert(!ics.includes(`UID:booking-${b.bookingId}-client@`), "Not the client's event");

      const pendingSlot = await makeSlot(41);
      const p = await book(pendingSlot.id);
      const s2 = await mkShooter("b");
      await assign(p.bookingId, s2.id);
      const sent = await mailTo(s2.email, 1);
      harness.assert(sent.length === 1 && !sent[0]?.icalEvent, "A pending shoot: the email, no invite", JSON.stringify(sent.map((m) => m.subject)));
    } finally {
      restoreMail();
    }
  });

  await harness.test("T35-SHOOT-02: a shooter assigned before the deposit was paid gets one invite when it's confirmed", async () => {
    captureMail();
    try {
      const slot = await makeSlot(42);
      const b = await book(slot.id);
      const s = await mkShooter("c");
      await assign(b.bookingId, s.id);
      await mailTo(s.email, 1);
      harness.assertEqual((await invitesTo(s.email, 0)).length, 0, "Nothing in the calendar while pending");

      await approve(b.invoiceId);
      const invites = await invitesTo(s.email, 1);
      await new Promise((r) => setTimeout(r, 300)); // anything extra would have arrived by now
      const all = mails.filter((m) => m.to === s.email && m.icalEvent);
      harness.assertEqual(all.length, 1, "Exactly one invite", JSON.stringify(all.map((m) => m.subject)));
      harness.assertEqual(invites[0]?.method, "REQUEST", "Added to their calendar");
      harness.assert(unfold(invites[0]?.content ?? "").includes(shooterUid(b.bookingId, s.id)), "Their event for this shoot");
      harness.assert(/confirmed/i.test(all[0]?.subject ?? ""), "The email says the shoot is confirmed", all[0]?.subject);
    } finally {
      restoreMail();
    }
  });

  await harness.test("T35-SHOOT-03: moves update the shooters' events; being taken off or a cancel removes them", async () => {
    captureMail();
    try {
      const from = await makeSlot(43);
      const to = await makeSlot(44);
      const b = await book(from.id);
      await approve(b.invoiceId);
      const s1 = await mkShooter("d");
      const s2 = await mkShooter("e");
      await assign(b.bookingId, s1.id);
      await assign(b.bookingId, s2.id);
      const [first1] = await invitesTo(s1.email, 1);
      await invitesTo(s2.email, 1);
      await new Promise((r) => setTimeout(r, 1100)); // the sequence counts seconds

      await withSession(owner, () => rescheduleBooking({ ...ids(b.bookingId), newSlotId: to.id }));
      const moved1 = (await invitesTo(s1.email, 2))[1];
      const moved2 = (await invitesTo(s2.email, 2))[1];
      harness.assertEqual(moved1?.method, "REQUEST", "Shooter 1's event is updated");
      harness.assertEqual(moved2?.method, "REQUEST", "Shooter 2's event is updated");
      harness.assert(seqOf(moved1?.content ?? "") > seqOf(first1?.content ?? ""), "A higher sequence");
      harness.assert(unfold(moved1?.content ?? "").includes(`DTSTART:${stamp(slotTimes(to)!.start)}`), "At the new time");

      await new Promise((r) => setTimeout(r, 1100));
      await withSession(owner, () => unassignTeamMember({ tenantId: lumina.id, tenantSlug: "lumina-cine", bookingId: b.bookingId, userId: s2.id }));
      const off = (await invitesTo(s2.email, 3))[2];
      harness.assertEqual(off?.method, "CANCEL", "Taken off: removed from their calendar");
      harness.assert(unfold(off?.content ?? "").includes(shooterUid(b.bookingId, s2.id)), "Their event");

      await withSession(owner, () => cancelBooking({ ...ids(b.bookingId), reason: "Weather" }));
      const gone = (await invitesTo(s1.email, 3))[2];
      harness.assertEqual(gone?.method, "CANCEL", "Cancelled: removed from the remaining shooter's calendar");
      harness.assert(unfold(gone?.content ?? "").includes(shooterUid(b.bookingId, s1.id)), "Their event");
      await new Promise((r) => setTimeout(r, 300));
      harness.assertEqual(mails.filter((m) => m.to === s2.email && m.icalEvent).length, 3, "The shooter already taken off hears nothing more");
    } finally {
      restoreMail();
    }
  });

  // ---- Final review fixes ----
  await harness.test("T35-FIX-01: if Resend refuses the invite, the email still goes, without it", async () => {
    try {
      for (const k of MAIL_KEYS) delete process.env[k];
      process.env.RESEND_API_KEY = "re_test_key";
      process.env.RESEND_FROM_EMAIL = "CineFlow OS <noreply@cineflow-os.app>";
      const bodies: Record<string, unknown>[] = [];
      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        bodies.push(body);
        return body.attachments
          ? new Response(JSON.stringify({ name: "validation_error", message: "Invalid content_type" }), { status: 422 })
          : new Response(JSON.stringify({ id: "email_2" }), { status: 200 });
      }) as typeof fetch;

      const r = await sendNotification(confirmedPayload(buildInvite(event(), "REQUEST")), "EMAIL");
      harness.assertEqual(r.emailDelivery, "SENT", "The confirmation is still delivered");
      harness.assertEqual(bodies.length, 2, "Tried with the invite, then without");
      harness.assertEqual(bodies[1]?.attachments, undefined, "The second try has no attachment");
      harness.assertEqual(r.calendar, undefined, "The send record doesn't claim an invite went");

      globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
      const denied = await sendNotification(confirmedPayload(buildInvite(event(), "REQUEST")), "EMAIL");
      harness.assertEqual(denied.emailDelivery, "FAILED", "A refusal that isn't about the email itself still fails");
    } finally {
      restoreMail();
    }
  });

  await harness.test("T35-FIX-02: taking yourself off a confirmed shoot removes it from your calendar", async () => {
    captureMail();
    try {
      const slot = await makeSlot(45);
      const b = await book(slot.id);
      const me = await mkShooter("self");
      const meSession = { id: me.id, email: me.email, name: me.name, role: "STUDIO_OWNER", tenantId: lumina.id, tenantSlug: "lumina-cine" };
      await db.user.update({ where: { id: me.id }, data: { role: "STUDIO_OWNER" } });
      // Assigned while pending, by themselves: no email then; the invite comes at confirmation.
      await withSession(meSession, () => assignTeamMember({ tenantId: lumina.id, tenantSlug: "lumina-cine", bookingIds: [b.bookingId], userId: me.id }));
      await approve(b.invoiceId);
      const [added] = await invitesTo(me.email, 1);
      harness.assertEqual(added?.method, "REQUEST", "In their calendar once confirmed");

      await withSession(meSession, () => unassignTeamMember({ tenantId: lumina.id, tenantSlug: "lumina-cine", bookingId: b.bookingId, userId: me.id }));
      const removed = (await invitesTo(me.email, 2))[1];
      harness.assertEqual(removed?.method, "CANCEL", "Taking yourself off removes it");
      harness.assert(unfold(removed?.content ?? "").includes(shooterUid(b.bookingId, me.id)), "Their event");
    } finally {
      restoreMail();
    }
  });
}

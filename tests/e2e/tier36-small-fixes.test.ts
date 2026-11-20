/**
 * Tier 36: small fixes from the security and calendar reviews (2026-11-20).
 * One test per fix; each was written to fail first.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { Transporter } from "nodemailer";
import { TestHarness } from "./test-harness";
import { withIp, withSession } from "./mocks/session";
import { db } from "@/lib/db";
import { middleware } from "@/middleware";
import { APP_BASE_DOMAIN } from "@/lib/domain-name";
import { registerClient } from "@/lib/actions/client-auth";
import { checkSignupCode } from "@/lib/actions/onboarding";
import { loginWithCredentials } from "@/lib/auth/session";
import { getNotificationHistory, platformSenderAddress, sendNotification, type NotificationPayload } from "@/lib/notifications";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import { buildInvite, inviteSequence, slotTimes, type InviteEvent } from "@/lib/calendar/ics";
import { processBookingCheckout } from "@/lib/actions/checkout";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { assignTeamMember } from "@/lib/actions/admin-assignments";
import { removeTeamMember } from "@/lib/actions/admin-team";
import { lookupMyBooking } from "@/lib/actions/my-booking";
import { SHOWCASE_PLACEHOLDER, showcaseCover } from "@/lib/showcase/cover";
import { runPrisma } from "../../scripts/prisma-cli.mjs";
import { withSubdomains } from "./tier33-studio-subdomains.test";

const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runTier36SmallFixesTests(harness: TestHarness) {
  harness.setSuite("Tier 36", "Small fixes");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  if (!lumina) throw new Error("Seed tenant lumina-cine is required");
  const ownerRow = await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  if (!ownerRow) throw new Error("Seed Lumina owner is required");
  const owner = { id: ownerRow.id, email: ownerRow.email, name: ownerRow.name, role: ownerRow.role, tenantId: ownerRow.tenantId, tenantSlug: "lumina-cine" };
  const run = Date.now().toString(36);
  const slotIds: string[] = [];
  harness.registerTeardown(async () => {
    await db.bookingAssignment.deleteMany({ where: { booking: { clientEmail: { startsWith: "t36-" } } } });
    await db.milestoneInvoice.deleteMany({ where: { client: { email: { startsWith: "t36-" } } } });
    await db.project.deleteMany({ where: { client: { email: { startsWith: "t36-" } } } });
    await db.clientBooking.deleteMany({ where: { clientEmail: { startsWith: "t36-" } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: slotIds } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t36-" } } });
  });

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
  type Mail = { to: string; subject: string; html: string; icalEvent?: { method: string; content: string } };
  const mails: Mail[] = [];
  const captureMail = () => {
    for (const k of MAIL_KEYS) delete process.env[k];
    process.env.SMTP_HOST = "mailpit";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_FROM_ADDRESS = "noreply@cineflow-os.my";
    setSmtpTransportForTests({
      sendMail: async (mail: Mail) => {
        mails.push(mail);
        return { messageId: "t36" };
      },
    } as unknown as Transporter);
  };
  const invitesTo = async (to: string, count: number) => {
    for (let i = 0; i < 40 && mails.filter((m) => m.to === to && m.icalEvent).length < count; i++) await sleep(50);
    return mails.filter((m) => m.to === to && m.icalEvent).map((m) => m.icalEvent!);
  };

  const DAY_MS = 86_400_000;
  let minute = 0;
  const makeSlot = async (daysAhead: number) => {
    minute += 1;
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        category: "EDITORIAL",
        date: new Date(`${new Date(Date.now() + daysAhead * DAY_MS).toISOString().slice(0, 10)}T00:00:00.000Z`),
        startTime: `0${(minute % 8) + 1}:15 PM`,
        endTime: `0${(minute % 8) + 1}:55 PM`,
        status: "AVAILABLE",
        price: 400,
        depositRequired: 100,
      },
    });
    slotIds.push(slot.id);
    return slot;
  };
  let seq = 0;
  const book = async (slotId: string) => {
    seq += 1;
    const email = `t36-client-${run}-${seq}@example.test`;
    const res = await withSession(null, () =>
      processBookingCheckout({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId,
        sessionId: `t36-${run}-${seq}`,
        clientName: "Small Fix Client",
        clientEmail: email,
        clientPhone: "0123456789",
        paymentMethod: "QR_CODE",
        paymentProofUrl: "/uploads/receipts/t36.jpg",
      })
    );
    if (!res.success) throw new Error(`T36 booking failed: ${res.message}`);
    return { bookingId: res.bookingId as string, invoiceId: res.invoiceId as string, email };
  };
  const approve = (invoiceId: string) =>
    withSession(owner, () => approvePaymentVerification({ invoiceId, tenantId: lumina.id, tenantSlug: "lumina-cine" }));

  const passwordless = (label: string) =>
    db.user.create({ data: { tenantId: lumina.id, email: `t36-${label}-${run}@example.test`, name: "Guest Client", phone: "0123", role: "CLIENT" } });
  const emailsTo = (email: string) => getNotificationHistory(500).filter((n) => n.recipientEmail === email);
  const lastEmailTo = (email: string) => emailsTo(email).at(-1);
  /** Waits for the background email (registerClient doesn't wait for it to send). */
  const waitForEmails = async (email: string, count: number) => {
    for (let i = 0; i < 100 && emailsTo(email).length < count; i++) await sleep(50);
  };

  // ── 1. Set-password email returns the client to the page they were on ─────────────────────────

  await harness.test("T36-01: the set-password email brings the client back to their checkout", async () => {
    const u = await passwordless("next");
    const reg = (next?: string) =>
      registerClient({ tenantSlug: "lumina-cine", name: "Guest Client", email: u.email, phone: "0123456", password: "longpassword1", ...(next ? { next } : {}) });
    await reg("/lumina-cine/checkout?slotId=abc");
    await waitForEmails(u.email, 1);
    harness.assert((lastEmailTo(u.email)?.emailHtml ?? "").includes("next=%2Flumina-cine%2Fcheckout%3FslotId%3Dabc"), "Back to the checkout", lastEmailTo(u.email)?.emailHtml);
    await reg("//evil.example/x");
    await waitForEmails(u.email, 2);
    harness.assert((lastEmailTo(u.email)?.emailHtml ?? "").includes("next=%2Flumina-cine%2Faccount"), "Another site: their account instead");
    await reg("/apex-studio/checkout");
    await waitForEmails(u.email, 3);
    harness.assert((lastEmailTo(u.email)?.emailHtml ?? "").includes("next=%2Flumina-cine%2Faccount"), "Another studio: their account instead");
  });

  // ── 6. The email limit is reported honestly ────────────────────────────────────────────────

  await harness.test("T36-06: once the set-password email limit is reached, the reply says so", async () => {
    const u = await passwordless("limit");
    const reg = () => registerClient({ tenantSlug: "lumina-cine", name: "Guest Client", email: u.email, phone: "0123456", password: "longpassword1" });
    for (let i = 0; i < 3; i++) await reg();
    await waitForEmails(u.email, 3);
    const before = getNotificationHistory(500).filter((n) => n.recipientEmail === u.email).length;
    const fourth = await reg();
    await sleep(500);
    harness.assertEqual(getNotificationHistory(500).filter((n) => n.recipientEmail === u.email).length, before, "No fourth email");
    harness.assert(!fourth.success && fourth.error === "CHECK_EMAIL", "Still points them at their inbox", JSON.stringify(fourth));
    harness.assert(!fourth.success && /already/i.test(fourth.message) && !/We've emailed you a link/.test(fourth.message), "Doesn't claim a new email was sent", !fourth.success ? fourth.message : "");
  });

  // ── 3. A wrong invite code is caught on the first step ─────────────────────────────────────

  await harness.test("T36-03: the studio invite code is checked before the rest of the form", async () => {
    const saved = process.env.STUDIO_SIGNUP_CODE;
    try {
      process.env.STUDIO_SIGNUP_CODE = "beta-2026";
      const ip = `203.0.113.${(Date.now() % 200) + 20}`;
      const wrong = await withIp(ip, () => checkSignupCode("nope"));
      harness.assertEqual(wrong.valid, false, "A wrong code is refused");
      harness.assert(/invite code/i.test(wrong.message ?? ""), "With a clear message", wrong.message);
      harness.assertEqual((await withIp(ip, () => checkSignupCode(" beta-2026 "))).valid, true, "The right code passes");
      for (let i = 0; i < 12; i++) await withIp(ip, () => checkSignupCode("guess"));
      const limited = await withIp(ip, () => checkSignupCode("beta-2026"));
      harness.assertEqual(limited.valid, false, "Guessing over and over is stopped");
      delete process.env.STUDIO_SIGNUP_CODE;
      harness.assertEqual((await withIp("203.0.113.9", () => checkSignupCode(""))).valid, true, "No code needed: nothing to check");
    } finally {
      if (saved === undefined) delete process.env.STUDIO_SIGNUP_CODE;
      else process.env.STUDIO_SIGNUP_CODE = saved;
    }
  });

  // ── 7. Failing to sign in on purpose can't lock someone else out ───────────────────────────

  await harness.test("T36-07: someone failing to sign in as you doesn't lock you out", async () => {
    const victim = await db.user.create({
      data: {
        tenantId: lumina.id,
        email: `t36-victim-${run}@example.test`,
        name: "Victim",
        role: "CLIENT",
        passwordHash: (await import("bcryptjs")).default.hashSync("correct-horse-1", 4),
      },
    });
    for (let i = 0; i < 12; i++) await withIp("198.51.100.66", () => loginWithCredentials(victim.email, "wrong", "lumina-cine"));
    const attacker = await withIp("198.51.100.66", () => loginWithCredentials(victim.email, "correct-horse-1", "lumina-cine"));
    harness.assertEqual(attacker.error, "RATE_LIMITED", "The guesser is stopped");
    const owner = await withIp("198.51.100.77", () => loginWithCredentials(victim.email, "correct-horse-1", "lumina-cine"));
    harness.assertEqual(owner.success, true, "The real owner, elsewhere, still gets in", JSON.stringify(owner));
  });

  // ── 8–10. Invite text and timing ───────────────────────────────────────────────────────────

  const event = (over: Partial<InviteEvent> = {}): InviteEvent => {
    const t = slotTimes({ date: new Date("2026-12-05T00:00:00Z"), startTime: "10:00 AM", endTime: "11:00 AM" }, "Asia/Kuala_Lumpur")!;
    return {
      uid: "booking-x-client@cineflow-os",
      sequence: 1,
      title: "Photo session",
      description: "Package: A",
      start: t.start,
      end: t.end,
      organizerName: "Lumina",
      organizerEmail: "noreply@cineflow-os.my",
      attendeeName: "Farah",
      attendeeEmail: "farah@example.test",
      ...over,
    };
  };

  await harness.test("T36-08: two changes in the same moment still get different, rising sequence numbers", async () => {
    const at = new Date("2026-11-20T10:00:00.000Z");
    const a = inviteSequence(at);
    const b = inviteSequence(at);
    harness.assert(b > a, "Same instant: the second is higher", `${a} ${b}`);
    harness.assert(inviteSequence(new Date(at.getTime() + 300)) > b, "A moment later: higher still");
    harness.assert(inviteSequence(new Date("2040-01-01T00:00:00Z")) < 2 ** 31, "Fits in a calendar's 32-bit number for years");
  });

  await harness.test("T36-09: a session with the same start and end time lasts an hour, not a day", async () => {
    const t = slotTimes({ date: new Date("2026-12-05T00:00:00Z"), startTime: "10:00 AM", endTime: "10:00 AM" }, "Asia/Kuala_Lumpur");
    harness.assertEqual(t?.end.getTime(), (t?.start.getTime() ?? 0) + 3_600_000, "One hour");
    const overnight = slotTimes({ date: new Date("2026-12-05T00:00:00Z"), startTime: "10:00 PM", endTime: "01:00 AM" }, "Asia/Kuala_Lumpur");
    harness.assertEqual(overnight?.end.getTime(), (overnight?.start.getTime() ?? 0) + 3 * 3_600_000, "An overnight session still ends the next day");
  });

  await harness.test("T36-10: stray control characters never reach the invite", async () => {
    const ics = buildInvite(event({ title: "Shoot\rA\u0007B\u0000", description: "x\r\ny\rz\u001b" }), "REQUEST").ics;
    harness.assert(!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(ics.replace(/\r\n/g, "")), "No control characters besides line ends", JSON.stringify(ics));
    harness.assert(!/\r(?!\n)/.test(ics), "No lone carriage returns");
    harness.assert(unfold(ics).includes("SUMMARY:Shoot\\nAB"), "A lone CR becomes a new line; others are dropped", unfold(ics));
  });

  // ── 13. A way into the calendar for mail apps that show only the file ──────────────────────

  await harness.test("T36-13: invite emails offer Google Calendar and the attached invite.ics; cancellations don't", async () => {
    const invite = buildInvite(event(), "REQUEST");
    harness.assert((invite.googleUrl ?? "").startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE"), "A Google Calendar link", invite.googleUrl);
    harness.assert((invite.googleUrl ?? "").includes("dates=20261205T020000Z%2F20261205T030000Z"), "At the session's time", invite.googleUrl);
    harness.assertEqual(buildInvite(event(), "CANCEL").googleUrl, undefined, "No link for a cancellation");
    const payload = (calendar?: ReturnType<typeof buildInvite>): NotificationPayload => ({
      event: "BOOKING_CONFIRMED",
      studioName: "Lumina",
      studioSlug: "lumina-cine",
      clientName: "Farah",
      clientEmail: `t36-gcal-${run}@example.test`,
      packageName: "A",
      slotDate: "Sat, 5 Dec 2026",
      startTime: "10:00 AM",
      endTime: "11:00 AM",
      depositAmount: 100,
      currency: "MYR",
      depositPaid: true,
      calendar,
    });
    captureMail();
    try {
      const r = await sendNotification(payload(invite), "EMAIL");
      harness.assert(r.emailHtml.includes("calendar.google.com/calendar/render") && r.emailHtml.includes("invite.ics"), "The email says how to add it", r.emailHtml.slice(-1500));
      harness.assert(r.emailText.includes("calendar.google.com/calendar/render"), "The plain-text version too");
      const cancelled = await sendNotification(payload(buildInvite(event(), "CANCEL")), "EMAIL");
      harness.assert(!cancelled.emailHtml.includes("calendar.google.com"), "Not for a cancellation");
    } finally {
      restoreMail();
    }
  });

  // ── 14. The invite's organiser is the address the email really comes from ──────────────────

  await harness.test("T36-14: with no sender set for Resend, the organiser is Resend's default sender", async () => {
    try {
      for (const k of MAIL_KEYS) delete process.env[k];
      process.env.RESEND_API_KEY = "re_test_key";
      harness.assertEqual(platformSenderAddress(), "onboarding@resend.dev", "Matches the email's From");
      process.env.RESEND_FROM_EMAIL = "CineFlow OS <noreply@cineflow-os.my>";
      harness.assertEqual(platformSenderAddress(), "noreply@cineflow-os.my", "A set sender is used");
    } finally {
      restoreMail();
    }
  });

  // ── 12. Every calendar email for a booking goes to the same address ────────────────────────

  await harness.test("T36-12: the confirmation and its invite go to the booking's contact, like later updates", async () => {
    captureMail();
    try {
      const slot = await makeSlot(50);
      const b = await book(slot.id);
      const contact = `t36-contact-${run}@example.test`;
      await db.clientBooking.update({ where: { id: b.bookingId }, data: { clientEmail: contact } });
      await approve(b.invoiceId);
      const [invite] = await invitesTo(contact, 1);
      harness.assertEqual(invite?.method, "REQUEST", "The booking's contact gets the invite");
      harness.assertEqual(mails.filter((m) => m.to === b.email && m.icalEvent).length, 0, "Not the other address");
    } finally {
      restoreMail();
    }
  });

  // ── 11. Removing a team member takes their shoots out of their calendar ────────────────────

  await harness.test("T36-11: a removed team member's upcoming confirmed shoots come out of their calendar", async () => {
    captureMail();
    try {
      const slot = await makeSlot(51);
      const b = await book(slot.id);
      await approve(b.invoiceId);
      const shooter = await db.user.create({
        data: { tenantId: lumina.id, email: `t36-shooter-${run}@example.test`, name: "T36 Shooter", role: "TEAM_MEMBER", passwordHash: "x" },
      });
      await withSession(owner, () => assignTeamMember({ tenantId: lumina.id, tenantSlug: "lumina-cine", bookingIds: [b.bookingId], userId: shooter.id }));
      await invitesTo(shooter.email, 1);
      await sleep(300);
      const removed = await withSession(owner, () => removeTeamMember({ tenantId: lumina.id, tenantSlug: "lumina-cine", userId: shooter.id }));
      harness.assert(removed.success === true, "Removed", JSON.stringify(removed));
      const cancel = (await invitesTo(shooter.email, 2))[1];
      harness.assertEqual(cancel?.method, "CANCEL", "Their event is cancelled");
      harness.assert(unfold(cancel?.content ?? "").includes(`UID:booking-${b.bookingId}-shooter-${shooter.id}@cineflow-os`), "The right event");
    } finally {
      restoreMail();
    }
  });

  // ── 15. A forwarded host list is read like everywhere else ─────────────────────────────────

  await harness.test("T36-15: the middleware takes the first forwarded host, like the sign-in cookie does", async () => {
    await withSubdomains(true, async () => {
      const res = await middleware(
        new NextRequest(`http://${APP_BASE_DOMAIN}/book`, {
          headers: { host: APP_BASE_DOMAIN, "x-forwarded-host": `lumina-cine.${APP_BASE_DOMAIN}, proxy.internal` },
        })
      );
      harness.assert((res.headers.get("x-middleware-rewrite") ?? "").endsWith("/lumina-cine/book"), "Served as the studio's booking page", res.headers.get("x-middleware-rewrite") ?? String(res.status));
    });
  });

  // ── 16. The database scripts work in folders whose names have spaces ──────────────────────

  await harness.test("T36-16: Prisma runs fine with a path that has spaces in it", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cineflow t36 "));
    try {
      const shadow = path.join(dir, "shadow db.db");
      const r = runPrisma(
        ["migrate", "diff", "--from-migrations", "prisma/migrations", "--to-schema-datamodel", "prisma/schema.prisma", "--shadow-database-url", `file:${shadow.split(path.sep).join("/")}`, "--exit-code"],
        { encoding: "utf8" }
      );
      harness.assertEqual(r.status, 0, "The recorded changes match the schema", `${r.stdout}${r.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ── 2. Find my booking shows the booking's project invoices too ────────────────────────────

  await harness.test("T36-02: Find my booking lists the invoices of the booking's own project, not just the deposit", async () => {
    const slot = await makeSlot(52);
    const b = await book(slot.id);
    await approve(b.invoiceId);
    const project = await db.project.findFirst({ where: { bookingId: b.bookingId } });
    harness.assert(Boolean(project), "A confirmed booking has its project");
    const booking = await db.clientBooking.findUniqueOrThrow({ where: { id: b.bookingId } });
    const client = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, email: b.email } });
    const extra = await db.milestoneInvoice.create({
      data: {
        tenantId: lumina.id,
        invoiceNumber: `T36-${run}`,
        projectId: project!.id,
        clientId: client.id,
        milestoneType: "FINAL_BALANCE_50",
        amount: 250,
        dueDate: new Date(Date.now() + 7 * DAY_MS),
      },
    });
    const other = await db.project.findFirst({ where: { tenantId: lumina.id, NOT: { bookingId: b.bookingId } } });
    const stranger = other
      ? await db.milestoneInvoice.create({
          data: { tenantId: lumina.id, invoiceNumber: `T36-X-${run}`, projectId: other.id, clientId: client.id, milestoneType: "CUSTOM", amount: 1, dueDate: new Date() },
        })
      : null;
    const res = await lookupMyBooking({ tenantSlug: "lumina-cine", email: b.email, trackingCode: booking.trackingCode });
    harness.assert(res.success === true, "Found", JSON.stringify(res).slice(0, 200));
    const ids = res.success ? res.booking.invoices.map((i) => i.id) : [];
    harness.assert(ids.includes(b.invoiceId), "The deposit");
    harness.assert(ids.includes(extra.id), "The project's balance invoice");
    if (stranger) harness.assert(!ids.includes(stranger.id), "Never another project's invoice");
  });

  // ── 5. Portfolio items without a cover photo ───────────────────────────────────────────────

  await harness.test("T36-05: a portfolio item without a cover shows the built-in placeholder", async () => {
    harness.assert(existsSync(path.join(process.cwd(), "public", SHOWCASE_PLACEHOLDER.replace(/^\//, ""))), "The placeholder file exists", SHOWCASE_PLACEHOLDER);
    harness.assertEqual(showcaseCover(""), SHOWCASE_PLACEHOLDER, "No cover");
    harness.assertEqual(showcaseCover(null), SHOWCASE_PLACEHOLDER, "Missing cover");
    harness.assertEqual(showcaseCover("/uploads/showcase/default.jpg"), SHOWCASE_PLACEHOLDER, "The old, missing default");
    harness.assertEqual(showcaseCover("/uploads/showcase/real.jpg"), "/uploads/showcase/real.jpg", "A real cover stays");
  });
}

/**
 * Tier 14: what the studio does with a booking after it is made.
 * - Move it to another open slot in the same category (slots swap, balance due date follows).
 * - Cancel it (slot reopens, unpaid invoices voided; paid bookings are owner-only).
 * - After the session: mark it done or a no-show (not before it starts).
 * - Deliver it, with an optional gallery link.
 */
import { db } from "@/lib/db";
import { loadBookableSlots } from "@/lib/bookings/bookable-slots";
import { loadBookingDetails } from "@/lib/bookings/details";
import { TestHarness } from "./test-harness";
import { withSession } from "./mocks/session";
import { processBookingCheckout } from "@/lib/actions/checkout";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import {
  cancelBooking,
  listRescheduleOptions,
  recordSessionOutcome,
  rescheduleBooking,
} from "@/lib/actions/admin-booking-lifecycle";
import { createInvoice, recordInvoicePayment, sendInvoiceReminder, voidInvoice } from "@/lib/actions/admin-invoices";
import { expectSuccess, loose, required } from "./result-helpers";

const DAY_MS = 86_400_000;

export async function runTier14BookingLifecycleTests(harness: TestHarness) {
  harness.setSuite("Tier 14", "Booking Lifecycle & Invoice Actions");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  if (!lumina) throw new Error("Seed tenant lumina-cine is required");
  const ownerRow = await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  if (!ownerRow) throw new Error("Seed Lumina owner is required");
  const as = (u: { id: string; email: string; name: string; role: string; tenantId: string | null }) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    tenantId: u.tenantId,
    tenantSlug: "lumina-cine",
  });
  const owner = as(ownerRow);
  const run = Date.now().toString(36);
  const crew = as(
    await db.user.create({ data: { tenantId: lumina.id, email: `t14-crew-${run}@example.test`, name: "T14 Crew", role: "CREW" } })
  );

  const slotIds: string[] = [];
  harness.registerTeardown(async () => {
    await db.milestoneInvoice.deleteMany({ where: { client: { email: { startsWith: "t14-" } } } });
    await db.clientBooking.deleteMany({ where: { clientEmail: { startsWith: "t14-" } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: slotIds } } });
    // Every confirmed booking now has a project; remove those before their clients.
    await db.project.deleteMany({ where: { client: { email: { startsWith: "t14-" } } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t14-" } } });
  });

  // "EDITORIAL" has no packages, so the slot's own fee and deposit apply.
  let minute = 0;
  const makeSlot = async (daysAhead: number, category = "EDITORIAL") => {
    minute += 1;
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        category,
        date: new Date(`${new Date(Date.now() + daysAhead * DAY_MS).toISOString().slice(0, 10)}T00:00:00.000Z`),
        startTime: `0${(minute % 8) + 1}:00 AM`,
        endTime: `0${(minute % 8) + 1}:30 AM`,
        status: "AVAILABLE",
        price: 400,
        depositRequired: 100,
      },
    });
    slotIds.push(slot.id);
    return slot;
  };
  let seq = 0;
  const book = async (slotId: string, paid: boolean) => {
    seq += 1;
    const res = await withSession(null, () =>
      processBookingCheckout({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId,
        sessionId: `t14-${run}-${seq}`,
        clientName: "Lifecycle Client",
        clientEmail: `t14-client-${run}-${seq}@example.test`,
        clientPhone: "0123456789",
        paymentMethod: "QR_CODE",
        paymentProofUrl: "/uploads/receipts/t14.jpg",
      })
    );
    expectSuccess(res, "res");
    if (!res.success) throw new Error(`T14 booking failed: ${res.message}`);
    if (paid) {
      await withSession(owner, () => approvePaymentVerification({ invoiceId: res.invoiceId, tenantId: lumina.id, tenantSlug: "lumina-cine" }));
    }
    return res.bookingId as string;
  };
  const ids = (bookingId: string) => ({ tenantId: lumina.id, tenantSlug: "lumina-cine", bookingId });

  await harness.test("T14-MOVE-01: a booking moves to an open slot in the same category; the slots swap", async () => {
    const from = await makeSlot(20);
    const to = await makeSlot(21);
    const other = await makeSlot(22, "commercial");
    const bookingId = await book(from.id, true);

    const options = await withSession(crew, () => listRescheduleOptions(ids(bookingId)));
    expectSuccess(options, "options");
    harness.assert(options.success && options.slots.some((s) => s.id === to.id), "The open slot is offered");
    harness.assert(!options.slots.some((s) => s.id === other.id), "Slots in another category are not offered");

    const wrong = loose(await withSession(crew, () => rescheduleBooking({ ...ids(bookingId), newSlotId: other.id })));
    harness.assertEqual(wrong.error, "CATEGORY_MISMATCH", "Other category refused");

    const res = await withSession(crew, () => rescheduleBooking({ ...ids(bookingId), newSlotId: to.id }));
    harness.assert(res.success === true, "Moved by crew", JSON.stringify(res));
    const booking = await db.clientBooking.findUnique({ where: { id: bookingId } });
    harness.assertEqual(booking?.slotId, to.id, "Booking points at the new slot");
    harness.assertEqual((await db.bookingSlot.findUnique({ where: { id: to.id } }))?.status, "BOOKED", "New slot booked");
    harness.assertEqual((await db.bookingSlot.findUnique({ where: { id: from.id } }))?.status, "AVAILABLE", "Old slot reopened");
    const balance = await db.milestoneInvoice.findFirst({ where: { bookingId, milestoneType: "BOOKING_BALANCE" } });
    harness.assertEqual(
      balance?.dueDate.toISOString().slice(0, 10),
      new Date(to.date.getTime() + 7 * DAY_MS).toISOString().slice(0, 10),
      "Balance is due a week after the new session"
    );
    const project = await db.project.findFirst({ where: { bookingId } });
    harness.assertEqual(project?.shootDates, to.date.toISOString().slice(0, 10), "The booking's gallery shows the new shoot date");
  });

  await harness.test("T14-CANCEL-01: cancelling reopens the slot and voids what is unpaid", async () => {
    const slot = await makeSlot(23);
    const bookingId = await book(slot.id, false);
    const tooShort = await withSession(crew, () => cancelBooking({ ...ids(bookingId), reason: "x" }));
    harness.assertEqual(tooShort.success, false, "A reason is required");
    const res = await withSession(crew, () => cancelBooking({ ...ids(bookingId), reason: "Client asked to cancel" }));
    harness.assert(res.success === true, "Unpaid booking cancelled by crew", JSON.stringify(res));
    const booking = await db.clientBooking.findUnique({ where: { id: bookingId } });
    harness.assertEqual(booking?.status, "CANCELLED", "Booking cancelled");
    harness.assertEqual(booking?.cancelReason, "Client asked to cancel", "Reason kept");
    harness.assertEqual(booking?.targetDate, slot.date.toISOString().slice(0, 10), "Session date kept on record");
    harness.assertEqual((await db.bookingSlot.findUnique({ where: { id: slot.id } }))?.status, "AVAILABLE", "Slot reopened");
    const deposit = await db.milestoneInvoice.findFirst({ where: { bookingId, milestoneType: "BOOKING_DEPOSIT" } });
    harness.assertEqual(deposit?.status, "VOID", "Unpaid deposit voided");
  });

  await harness.test("T14-CANCEL-02: a paid booking can only be cancelled by the owner; the paid deposit stays paid", async () => {
    const slot = await makeSlot(24);
    const bookingId = await book(slot.id, true);
    const byCrew = loose(await withSession(crew, () => cancelBooking({ ...ids(bookingId), reason: "Weather" })));
    harness.assertEqual(byCrew.error, "OWNER_ONLY", "Crew refused");
    const byOwner = await withSession(owner, () => cancelBooking({ ...ids(bookingId), reason: "Weather" }));
    harness.assert(byOwner.success === true, "Owner cancels", JSON.stringify(byOwner));
    const deposit = await db.milestoneInvoice.findFirst({ where: { bookingId, milestoneType: "BOOKING_DEPOSIT" } });
    const balance = await db.milestoneInvoice.findFirst({ where: { bookingId, milestoneType: "BOOKING_BALANCE" } });
    harness.assertEqual(deposit?.status, "PAID", "Paid deposit stays on record");
    harness.assertEqual(balance?.status, "VOID", "Unpaid balance voided");
  });

  await harness.test("T14-DONE-01: done / no-show only after the session starts; delivered bookings stay closed", async () => {
    const future = await makeSlot(25);
    const futureBooking = await book(future.id, true);
    const early = loose(await withSession(crew, () => recordSessionOutcome({ ...ids(futureBooking), outcome: "COMPLETED" })));
    harness.assertEqual(early.error, "NOT_STARTED", "Can't mark a future session done");

    // The session day comes.
    await db.bookingSlot.update({ where: { id: future.id }, data: { date: new Date(Date.now() - 2 * DAY_MS) } });
    const done = await withSession(crew, () => recordSessionOutcome({ ...ids(futureBooking), outcome: "COMPLETED" }));
    harness.assert(done.success === true, "Marked done", JSON.stringify(done));
    harness.assertEqual((await db.clientBooking.findUnique({ where: { id: futureBooking } }))?.status, "COMPLETED", "Status COMPLETED");

    // Photos handed over ("Notify client: photos ready", covered in tier 15).
    await db.clientBooking.update({ where: { id: futureBooking }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    const cancelDelivered = loose(await withSession(owner, () => cancelBooking({ ...ids(futureBooking), reason: "Too late" })));
    harness.assertEqual(cancelDelivered.error, "NOT_CANCELLABLE", "Delivered bookings can't be cancelled");
  });

  await harness.test("T14-DONE-02: a client who didn't turn up is recorded as a no-show", async () => {
    const slot = await makeSlot(26);
    const bookingId = await book(slot.id, true);
    await db.bookingSlot.update({ where: { id: slot.id }, data: { date: new Date(Date.now() - 2 * DAY_MS) } });
    const res = await withSession(crew, () => recordSessionOutcome({ ...ids(bookingId), outcome: "NO_SHOW" }));
    harness.assert(res.success === true, "No-show recorded", JSON.stringify(res));
    harness.assertEqual((await db.clientBooking.findUnique({ where: { id: bookingId } }))?.status, "NO_SHOW", "Status NO_SHOW");
  });

  await harness.test("T14-AUTH-01: other studios and clients can't act on a booking", async () => {
    const slot = await makeSlot(27);
    const bookingId = await book(slot.id, false);
    const apexOwnerRow = await db.user.findFirst({ where: { role: "STUDIO_OWNER", tenantId: { not: lumina.id } } });
    const outsider = { ...as(apexOwnerRow!), tenantSlug: "apex-media" };
    const res = await withSession(outsider, () => cancelBooking({ ...ids(bookingId), reason: "Not mine" }));
    harness.assertEqual(res.success, false, "Another studio's owner refused");
    harness.assertEqual((await db.clientBooking.findUnique({ where: { id: bookingId } }))?.status, "PENDING", "Booking untouched");
  });

  // ---- Invoice actions -----------------------------------------------------------------
  const invoiceClient = await db.user.create({
    data: { tenantId: lumina.id, email: `t14-inv-${run}@example.test`, name: "Invoice Client", role: "CLIENT" },
  });
  const inTwoWeeks = new Date(Date.now() + 14 * DAY_MS).toISOString().slice(0, 10);

  await harness.test("T14-INV-01: the owner issues a custom invoice with the next studio number; crew can't", async () => {
    const input = { tenantId: lumina.id, tenantSlug: "lumina-cine", clientId: invoiceClient.id, description: "Extra hour of coverage", amount: 150, dueDate: inTwoWeeks, notifyClient: false };
    const byCrew = await withSession(crew, () => createInvoice(input));
    harness.assertEqual(byCrew.success, false, "Crew can't issue invoices");
    const res = loose(await withSession(owner, () => createInvoice(input)));
    harness.assert(res.success === true, "Owner issues it", JSON.stringify(res));
    const inv = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assertEqual(inv?.milestoneType, "CUSTOM", "Custom invoice");
    harness.assertEqual(inv?.description, "Extra hour of coverage", "Description stored");
    harness.assert(/^INV-\d{4}-\d{4,}$/.test(inv!.invoiceNumber), `Sequential studio number (${inv?.invoiceNumber})`);
    const past = loose(await withSession(owner, () => createInvoice({ ...input, dueDate: "2020-01-01" })));
    harness.assertEqual(past.error, "DUE_IN_PAST", "Due date can't be in the past");
  });

  await harness.test("T14-INV-02: record a cash payment, remind, and cancel unpaid invoices", async () => {
    const mk = async (description: string) => {
      const made = await withSession(owner, () =>
        createInvoice({ tenantId: lumina.id, tenantSlug: "lumina-cine", clientId: invoiceClient.id, description, amount: 80, dueDate: inTwoWeeks, notifyClient: false })
      );
      expectSuccess(made, `createInvoice(${description})`);
      return { ...made, invoiceId: required(made.invoiceId, "invoiceId") };
    };
    const a = await mk("Print order");
    const ids = { tenantId: lumina.id, tenantSlug: "lumina-cine", invoiceId: a.invoiceId };

    const reminder = await withSession(crew, () => sendInvoiceReminder(ids));
    harness.assert(reminder.success === true, "Crew can send a reminder", JSON.stringify(reminder));

    const crewPay = await withSession(crew, () => recordInvoicePayment({ ...ids, method: "CASH" }));
    harness.assertEqual(crewPay.success, false, "Crew can't record a payment");
    const pay = await withSession(owner, () => recordInvoicePayment({ ...ids, method: "CASH", reference: "Till #42" }));
    harness.assert(pay.success === true, "Owner records cash", JSON.stringify(pay));
    const paid = await db.milestoneInvoice.findUnique({ where: { id: a.invoiceId } });
    harness.assertEqual(paid?.status, "PAID", "Invoice paid");
    harness.assertEqual(paid?.paymentMethod, "CASH", "Method recorded");
    harness.assertEqual(paid?.verifiedBy, owner.name, "Recorded under the owner");
    const again = loose(await withSession(owner, () => recordInvoicePayment({ ...ids, method: "CASH" })));
    harness.assertEqual(again.error, "NOT_UNPAID", "Can't record a payment twice");
    const voidPaid = loose(await withSession(owner, () => voidInvoice({ ...ids, reason: "Mistake" })));
    harness.assertEqual(voidPaid.error, "NOT_UNPAID", "Can't cancel a paid invoice");

    const b = await mk("Duplicate");
    const v = await withSession(owner, () => voidInvoice({ tenantId: lumina.id, tenantSlug: "lumina-cine", invoiceId: b.invoiceId, reason: "Issued twice" }));
    harness.assert(v.success === true, "Owner cancels an unpaid invoice", JSON.stringify(v));
    harness.assertEqual((await db.milestoneInvoice.findUnique({ where: { id: b.invoiceId } }))?.status, "VOID", "Invoice cancelled");
  });

  await harness.test("T14-INV-03: a deposit for an active booking can't be cancelled on its own", async () => {
    const slot = await makeSlot(28);
    const bookingId = await book(slot.id, false);
    const deposit = await db.milestoneInvoice.findFirst({ where: { bookingId, milestoneType: "BOOKING_DEPOSIT" } });
    const res = loose(await withSession(owner, () => voidInvoice({ tenantId: lumina.id, tenantSlug: "lumina-cine", invoiceId: deposit!.id, reason: "Test" })));
    harness.assertEqual(res.error, "BOOKING_ACTIVE", "Refused: cancel the booking instead");
  });

  await harness.test("T14-BOOKABLE-01: New booking offers only open, upcoming slots of this studio", async () => {
    // Fixed clock: 12:00 noon on 15 Jun 2030 in the studio's zone (Asia/Kuala_Lumpur, UTC+8).
    const now = new Date("2030-06-15T04:00:00Z");
    const day = (d: string) => new Date(`${d}T00:00:00Z`);
    const run = Date.now().toString(36);
    const t = await db.tenant.create({ data: { name: "T14 Bookable", slug: `t14-bookable-${run}` } });
    const other = await db.tenant.create({ data: { name: "T14 Other", slug: `t14-other-${run}` } });
    harness.registerTeardown(async () => {
      await db.tenant.deleteMany({ where: { id: { in: [t.id, other.id] } } });
    });
    const slot = (tenantId: string, date: string, startTime: string, extra: Record<string, unknown> = {}) =>
      db.bookingSlot.create({ data: { tenantId, date: day(date), startTime, endTime: "11:59 PM", ...extra } });

    const laterToday = await slot(t.id, "2030-06-15", "02:00 PM");
    const tomorrow = await slot(t.id, "2030-06-16", "10:00 AM");
    const expiredHold = await slot(t.id, "2030-06-17", "10:00 AM", { status: "HELD", heldUntil: new Date("2030-06-15T03:00:00Z"), heldBySessionId: "s1" });
    await slot(t.id, "2030-06-14", "10:00 AM"); // yesterday
    await slot(t.id, "2030-06-15", "09:00 AM"); // already started today
    await slot(t.id, "2030-06-16", "01:00 PM", { status: "BLOCKED" });
    await slot(t.id, "2030-06-16", "03:00 PM", { status: "BOOKED" });
    await slot(t.id, "2030-06-16", "05:00 PM", { status: "HELD", heldUntil: new Date("2030-06-15T05:00:00Z"), heldBySessionId: "s2" });
    await slot(other.id, "2030-06-16", "10:00 AM"); // another studio

    const ids = (await loadBookableSlots(t.id, now)).map((s) => s.id);
    harness.assertDeepEqual(
      ids,
      [laterToday.id, tomorrow.id, expiredHold.id],
      "Only open, not-yet-started slots of this studio, in date and time order",
    );
    const released = await db.bookingSlot.findUnique({ where: { id: expiredHold.id } });
    harness.assertEqual(released?.status, "AVAILABLE", "An expired hold is released so it can be booked");
  });

  await harness.test("T14-BOOKING-PAGE-01: a booking page only loads the booking within its own studio", async () => {
    const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
    const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
    const apexBooking = apex ? await db.clientBooking.findFirst({ where: { tenantId: apex.id } }) : null;
    if (!apex || !lumina || !apexBooking) throw new Error("Seed apex-media booking and lumina-cine are required");
    const own = await loadBookingDetails(apex.id, { bookingId: apexBooking.id });
    harness.assertEqual(own.length, 1, "The studio's own booking loads");
    harness.assertEqual(own[0]?.id, apexBooking.id, "It is the requested booking");
    const foreign = await loadBookingDetails(lumina.id, { bookingId: apexBooking.id });
    harness.assertEqual(foreign.length, 0, "Another studio's booking id loads nothing (page shows 404)");
  });
}

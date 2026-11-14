/**
 * Tier 11: Public Booking Calendar
 * - Slot time helpers (clock-time parsing, session blocks, studio time zone)
 * - Sessions that have already started can't be held, checked out or offered
 * - The booking page offers only upcoming slots
 */

import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { minutesOfDay, sessionBlock, studioNow, isSlotInPast, slotDateKey, formatSlotDate } from "@/lib/slot-time";
import { holdBookingSlot } from "@/lib/actions/booking";
import { processBookingCheckout } from "@/lib/actions/checkout";
import BookingPage from "@/app/[tenantSlug]/book/page";
import { withSession } from "./mocks/session";
import { packageRangeFor } from "@/lib/bookings/package-range";
import { findProp, provideReactGlobal } from "./react-tree";

const DAY_MS = 86_400_000;

/** YYYY-MM-DD shifted by whole days. */
function shiftDay(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Walks a server-component element tree and returns the first props object that has `key`. */

export async function runTier11BookingCalendarTests(harness: TestHarness) {
  harness.setSuite("Tier 11", "Public Booking Calendar");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  if (!lumina) throw new Error("Seed tenant lumina-cine is required");

  const run = Date.now().toString(36);
  const createdSlotIds: string[] = [];
  harness.registerTeardown(async () => {
    await db.milestoneInvoice.deleteMany({ where: { client: { email: { startsWith: "t11-" } } } });
    await db.clientBooking.deleteMany({ where: { clientEmail: { startsWith: "t11-" } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: createdSlotIds } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t11-" } } });
  });

  const makeSlot = async (dateKey: string, startTime: string, endTime: string) => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        date: new Date(`${dateKey}T00:00:00.000Z`),
        startTime,
        endTime,
        status: "AVAILABLE",
        price: 300,
        depositRequired: 100,
      },
    });
    createdSlotIds.push(slot.id);
    return slot;
  };

  // ============================================================================
  // 11.1 Time helpers
  // ============================================================================
  await harness.test("T11-TIME-01: start times are parsed as clock time", async () => {
    harness.assertEqual(minutesOfDay("09:00 AM"), 540, "09:00 AM");
    harness.assertEqual(minutesOfDay("9:30 am"), 570, "9:30 am (lowercase, no leading zero)");
    harness.assertEqual(minutesOfDay("12:00 PM"), 720, "12:00 PM is noon");
    harness.assertEqual(minutesOfDay("12:30 AM"), 30, "12:30 AM is just after midnight");
    harness.assertEqual(minutesOfDay("09:00 PM"), 1260, "09:00 PM");
    harness.assertEqual(minutesOfDay("21:00"), 1260, "24-hour 21:00");
    harness.assertEqual(minutesOfDay("13:00 PM"), null, "13:00 PM is invalid");
    harness.assertEqual(minutesOfDay("soon"), null, "Non-time text is rejected");
  });

  await harness.test("T11-TIME-02: evening times are not grouped as morning", async () => {
    harness.assertEqual(sessionBlock("09:00 AM"), "morning", "09:00 AM is morning");
    harness.assertEqual(sessionBlock("11:30 AM"), "morning", "11:30 AM is morning");
    harness.assertEqual(sessionBlock("12:00 PM"), "afternoon", "Noon starts the afternoon");
    harness.assertEqual(sessionBlock("04:59 PM"), "afternoon", "04:59 PM is afternoon");
    harness.assertEqual(sessionBlock("05:00 PM"), "evening", "05:00 PM starts the evening");
    harness.assertEqual(sessionBlock("09:00 PM"), "evening", "09:00 PM is evening, not morning");
    harness.assertEqual(sessionBlock("10:30 PM"), "evening", "10:30 PM is evening, not morning");
  });

  await harness.test("T11-TIME-03: 'now' is read in the studio's time zone, not the server's", async () => {
    // 16:30 UTC on 4 Nov is 00:30 on 5 Nov in Kuala Lumpur (UTC+8).
    const now = new Date("2026-11-04T16:30:00Z");
    const kl = studioNow(now, "Asia/Kuala_Lumpur");
    harness.assertEqual(kl.dateKey, "2026-11-05", "Studio date has rolled over");
    harness.assertEqual(kl.minutes, 30, "Studio time is 00:30");
    const utc = studioNow(now, "UTC");
    harness.assertEqual(utc.dateKey, "2026-11-04", "Same instant is still 4 Nov in UTC");
  });

  await harness.test("T11-TIME-04: a slot is past once its start time has passed", async () => {
    const now = new Date("2026-11-04T02:00:00Z"); // 10:00 AM on 4 Nov in Kuala Lumpur
    const tz = "Asia/Kuala_Lumpur";
    const on = (date: string, startTime: string) => isSlotInPast({ date: `${date}T00:00:00.000Z`, startTime }, now, tz);
    harness.assertEqual(on("2026-11-03", "11:00 PM"), true, "Yesterday is past");
    harness.assertEqual(on("2026-11-04", "09:30 AM"), true, "Earlier today is past");
    harness.assertEqual(on("2026-11-04", "10:00 AM"), true, "A session starting right now can't be booked");
    harness.assertEqual(on("2026-11-04", "10:30 AM"), false, "Later today is upcoming");
    harness.assertEqual(on("2026-11-04", "09:00 PM"), false, "Tonight is upcoming");
    harness.assertEqual(on("2026-11-05", "09:00 AM"), false, "Tomorrow is upcoming");
  });

  await harness.test("T11-TIME-05: slot dates display as the stored calendar day", async () => {
    harness.assertEqual(slotDateKey(new Date("2026-11-01T00:00:00.000Z")), "2026-11-01", "Date key");
    harness.assertEqual(
      formatSlotDate("2026-11-01T00:00:00.000Z", { weekday: "short", day: "numeric", month: "short" }),
      "Sun 1 Nov",
      "1 Nov stays 1 Nov regardless of the viewer's time zone"
    );
  });

  // ============================================================================
  // 11.2 Past sessions are refused by the server
  // ============================================================================
  const today = studioNow().dateKey;
  const yesterday = shiftDay(today, -1);
  const future = shiftDay(today, 30);

  await harness.test("T11-PAST-01: a past slot cannot be held", async () => {
    const slot = await makeSlot(yesterday, "10:00 AM", "10:30 AM");
    const res = await withSession(null, () =>
      holdBookingSlot({ tenantId: lumina.id, slotId: slot.id, sessionId: `t11-hold-${run}` })
    );
    harness.assert(res.success === false, "Hold refused");
    harness.assertEqual(res.error, "SLOT_IN_PAST", "Refused because the session has passed");
    const after = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(after?.status, "AVAILABLE", "Slot left untouched");
  });

  await harness.test("T11-PAST-02: a past slot cannot be checked out", async () => {
    const slot = await makeSlot(yesterday, "11:00 AM", "11:30 AM");
    const email = `t11-checkout-${run}@example.test`;
    const res = await withSession(null, () =>
      processBookingCheckout({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: slot.id,
        sessionId: `t11-checkout-${run}`,
        clientName: "Late Client",
        clientEmail: email,
        clientPhone: "0123456789",
        paymentMethod: "QR_CODE",
      })
    );
    harness.assert(res.success === false, "Checkout refused");
    harness.assertEqual(res.error, "SLOT_IN_PAST", "Refused because the session has passed");
    const booking = await db.clientBooking.findFirst({ where: { clientEmail: email } });
    harness.assert(!booking, "No booking created");
    const after = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(after?.status, "AVAILABLE", "Slot left untouched");
  });

  await harness.test("T11-PAST-03: an upcoming slot can still be held", async () => {
    const slot = await makeSlot(future, "10:00 AM", "10:30 AM");
    const res = await withSession(null, () =>
      holdBookingSlot({ tenantId: lumina.id, slotId: slot.id, sessionId: `t11-future-${run}` })
    );
    harness.assert(res.success === true, `Hold succeeds (${res.message ?? "ok"})`);
  });

  // ============================================================================
  // 11.3 Booking page offers only upcoming slots
  // ============================================================================
  await harness.test("T11-PAGE-01: the booking page lists upcoming slots only", async () => {
    const past = await makeSlot(yesterday, "02:00 PM", "02:30 PM");
    const upcoming = await makeSlot(future, "02:00 PM", "02:30 PM");
    // tsx compiles the page's JSX to React.createElement; Next normally supplies React itself.
    await provideReactGlobal();
    const tree = await withSession(null, () =>
      BookingPage({ params: Promise.resolve({ tenantSlug: "lumina-cine" }), searchParams: Promise.resolve({}) })
    );
    const slots = findProp<Array<{ id: string; date: Date; startTime: string }>>(tree, "initialSlots") ?? [];
    harness.assert(slots.length > 0, "Booking page passes slots to the calendar");
    harness.assert(!slots.some((s) => s.id === past.id), "Yesterday's slot is not offered");
    harness.assert(slots.some((s) => s.id === upcoming.id), "Upcoming slot is offered");
    harness.assert(!slots.some((s) => isSlotInPast(s)), "No offered slot has already started");
  });

  await harness.test("T11-PRICING-01: a category's package range drives the slot dialogs", async () => {
    const packages = [
      { category: "STUDIO_PORTRAIT", price: 300, depositPrice: 100 },
      { category: "studio-portrait", price: 1200, depositPrice: 250 },
      { category: "WEDDING", price: 5000, depositPrice: 1000 },
    ];
    const portrait = packageRangeFor(packages, "studio_portrait");
    harness.assertDeepEqual(
      portrait,
      { count: 2, minPrice: 300, maxPrice: 1200, minDeposit: 100 },
      "Matches categories loosely and spans every package in the category",
    );
    harness.assertDeepEqual(
      packageRangeFor(packages, "WEDDING"),
      { count: 1, minPrice: 5000, maxPrice: 5000, minDeposit: 1000 },
      "A single package gives a one-price range",
    );
    harness.assertEqual(packageRangeFor(packages, "CONVOCATION"), null, "No packages: null, so the slot fee fields show");
    harness.assertEqual(packageRangeFor([], "WEDDING"), null, "Empty package list: null");
  });
}

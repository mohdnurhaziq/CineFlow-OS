/**
 * Tier 37: the admin Calendar's month view. Slots in time order (09:00 AM before 02:00 PM), the
 * month grid (weeks start on Monday), what each day shows, and which day opens first.
 */

import { TestHarness } from "./test-harness";
import { compareSlots, daySummaries, defaultCalendarDay, monthGrid, shiftMonth } from "@/lib/calendar/month-grid";

const slot = (date: string, startTime: string, status = "AVAILABLE") => ({ date: new Date(`${date}T00:00:00.000Z`), startTime, status });

export async function runTier37CalendarMonthTests(harness: TestHarness) {
  harness.setSuite("Tier 37", "Calendar month view");

  await harness.test("T37-01: slots are in time order within a day, not text order", async () => {
    const sorted = [slot("2026-11-21", "02:00 PM"), slot("2026-11-22", "08:00 AM"), slot("2026-11-21", "09:00 AM"), slot("2026-11-21", "12:45 PM"), slot("2026-11-21", "10:15 AM")]
      .sort(compareSlots)
      .map((s) => `${s.date.toISOString().slice(0, 10)} ${s.startTime}`);
    harness.assertEqual(
      sorted.join(" | "),
      "2026-11-21 09:00 AM | 2026-11-21 10:15 AM | 2026-11-21 12:45 PM | 2026-11-21 02:00 PM | 2026-11-22 08:00 AM",
      "Morning before afternoon, then the next day"
    );
  });

  await harness.test("T37-02: the month grid starts weeks on Monday and covers every day once", async () => {
    const weeks = monthGrid(2026, 10); // November 2026: the 1st is a Sunday
    harness.assertEqual(weeks[0]?.slice(0, 6).every((d) => d === null), true, "1 Nov sits on Sunday, after six empty cells");
    harness.assertEqual(weeks[0]?.[6], "2026-11-01", "Sunday the 1st");
    const days = weeks.flat().filter(Boolean);
    harness.assertEqual(days.length, 30, "All 30 days");
    harness.assertEqual(days.at(-1), "2026-11-30", "Ends on the 30th");
    harness.assert(weeks.every((w) => w.length === 7), "Every week has seven cells");
    harness.assertEqual(monthGrid(2027, 1).flat().filter(Boolean).length, 28, "February 2027 has 28 days");
    harness.assertEqual(JSON.stringify(shiftMonth({ year: 2026, month: 11 }, 1)), JSON.stringify({ year: 2027, month: 0 }), "December → January");
    harness.assertEqual(JSON.stringify(shiftMonth({ year: 2026, month: 0 }, -1)), JSON.stringify({ year: 2025, month: 11 }), "January → December");
  });

  await harness.test("T37-03: each day says how many slots are open, booked, waiting or blocked", async () => {
    const s = daySummaries([
      slot("2026-11-21", "09:00 AM", "BOOKED"),
      slot("2026-11-21", "10:00 AM"),
      slot("2026-11-21", "11:00 AM"),
      slot("2026-11-21", "12:00 PM", "HELD"),
      slot("2026-11-21", "01:00 PM", "PENDING_VERIFICATION"),
      slot("2026-11-21", "02:00 PM", "BLOCKED"),
      slot("2026-11-22", "09:00 AM"),
    ]);
    harness.assertEqual(JSON.stringify(s.get("2026-11-21")), JSON.stringify({ total: 6, open: 2, booked: 1, waiting: 2, blocked: 1 }), "Sat 21");
    harness.assertEqual(s.get("2026-11-22")?.open, 1, "Sun 22");
    harness.assertEqual(s.get("2026-11-23"), undefined, "A day without slots has no entry");

    const now = new Date("2026-11-21T04:00:00Z"); // 12:00 PM in Kuala Lumpur
    const timed = daySummaries([slot("2026-11-20", "09:00 AM"), slot("2026-11-21", "10:00 AM"), slot("2026-11-21", "03:00 PM")], now);
    harness.assertEqual(timed.get("2026-11-20")?.open, 0, "A slot whose time has passed isn't open");
    harness.assertEqual(timed.get("2026-11-20")?.total, 1, "…but still counts as a slot that day");
    harness.assertEqual(timed.get("2026-11-21")?.open, 1, "Earlier today has passed; this afternoon is still open");
  });

  await harness.test("T37-04: the calendar opens on today if it has slots, else the next day that does", async () => {
    const slots = [slot("2026-11-18", "09:00 AM"), slot("2026-11-24", "09:00 AM"), slot("2026-11-28", "09:00 AM")];
    harness.assertEqual(defaultCalendarDay(slots, "2026-11-21"), "2026-11-24", "The next day with slots");
    harness.assertEqual(defaultCalendarDay([...slots, slot("2026-11-21", "03:00 PM")], "2026-11-21"), "2026-11-21", "Today, when it has slots");
    harness.assertEqual(defaultCalendarDay([slot("2026-11-02", "09:00 AM")], "2026-11-21"), "2026-11-21", "Nothing coming up: today");
  });
}

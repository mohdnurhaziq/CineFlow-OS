/** When gear can be checked out for a reservation. Safe to import from client and server code. */

/** Gear can be checked out from this long before the reservation starts (prep day). */
export const CHECKOUT_LEAD_HOURS = 48;

/** Whether a reservation can be checked out now: from CHECKOUT_LEAD_HOURS before it starts until it ends. */
export function checkoutWindow(
  reservation: { startDate: Date | string; endDate: Date | string },
  now: Date = new Date()
): { open: true } | { open: false; error: string; message: string } {
  const start = new Date(reservation.startDate).getTime();
  const end = new Date(reservation.endDate).getTime();
  const opens = start - CHECKOUT_LEAD_HOURS * 3_600_000;
  const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (now.getTime() < opens) {
    return { open: false, error: "TOO_EARLY", message: `Too early: this gear can be checked out from ${day(opens)}.` };
  }
  if (now.getTime() > end) {
    return { open: false, error: "RESERVATION_ENDED", message: `This reservation ended on ${day(end)}.` };
  }
  return { open: true };
}

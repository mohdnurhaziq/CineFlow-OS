/**
 * The Bookings list's "Unassigned" filter. Plain module: safe in server and client code.
 */

/** Upcoming (session date today or later, studio time), still PENDING or CONFIRMED, and nobody on it. */
export function isUnassigned(
  row: { status: string; sessionDate: string | null; assignees: unknown[] },
  today: string
): boolean {
  return (
    (row.status === "PENDING" || row.status === "CONFIRMED") &&
    !!row.sessionDate &&
    row.sessionDate >= today &&
    row.assignees.length === 0
  );
}

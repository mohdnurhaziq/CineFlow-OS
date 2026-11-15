/**
 * One-off backfill: give every existing package booking its included prints (as BACKFILL
 * lines), from the package's lines as they are today. Safe to repeat: bookings that
 * already have lines are skipped.
 *
 *   npm run db:backfill-included-prints
 */
import { db } from "@/lib/db";
import { snapshotIncludedPrints } from "@/lib/prints/entitlements";

export async function backfillIncludedPrints(): Promise<{ bookings: number; lines: number }> {
  const bookings = await db.clientBooking.findMany({
    where: { packageId: { not: null }, includedPrints: { none: {} }, package: { includedPrints: { some: {} } } },
    select: { id: true, tenantId: true, packageId: true },
  });
  let lines = 0;
  let touched = 0;
  for (const b of bookings) {
    const n = await db.$transaction((tx) => snapshotIncludedPrints(tx, b, "BACKFILL"));
    if (n > 0) touched += 1;
    lines += n;
  }
  return { bookings: touched, lines };
}

// Only run when executed directly (tests import the function above).
if (process.argv[1] && /backfill-included-prints\.[cm]?[jt]s$/.test(process.argv[1])) {
  backfillIncludedPrints()
    .then((r) => console.log(`Gave ${r.bookings} booking(s) ${r.lines} included print line(s).`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}

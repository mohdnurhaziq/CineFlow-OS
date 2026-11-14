/**
 * One-off backfill: give every confirmed booking its gallery (a Session or Production
 * project), for bookings confirmed before every booking got one automatically.
 *
 * Uses the same provisioning as a live confirmation, so the kind follows the booking's
 * category. Only creates missing projects; never changes an existing one. Safe to re-run.
 *
 *   npm run db:backfill-booking-projects            # apply
 *   npm run db:backfill-booking-projects -- --dry   # report only
 */
import { db } from "@/lib/db";
import { projectKindForBooking, provisionProjectForBooking } from "@/lib/bookings/project-promotion";

async function main() {
  const dryRun = process.argv.includes("--dry");
  const bookings = await db.clientBooking.findMany({
    where: { status: { in: ["CONFIRMED", "COMPLETED", "DELIVERED"] }, project: null },
    select: { id: true, tenantId: true, category: true, trackingCode: true, tenant: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  for (const booking of bookings) {
    if (dryRun) {
      const kind = await projectKindForBooking(db, booking);
      console.log(`${booking.tenant.slug}: ${booking.trackingCode} -> new ${kind} project`);
      created += 1;
      continue;
    }
    const result = await db.$transaction((tx) => provisionProjectForBooking(tx, booking.id));
    if (!result || result.alreadyExists) continue;
    const kind = (await db.project.findUnique({ where: { id: result.project.id }, select: { kind: true } }))?.kind;
    console.log(`${booking.tenant.slug}: ${booking.trackingCode} -> ${result.project.projectNumber} (${kind})`);
    created += 1;
  }
  console.log(`${dryRun ? "Would create" : "Created"} ${created} project(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

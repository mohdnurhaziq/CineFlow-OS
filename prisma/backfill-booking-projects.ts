/**
 * One-off backfill: give every confirmed booking its gallery (a Session or Production
 * project). See lib/bookings/backfill-projects.ts for what it does.
 *
 *   npm run db:backfill-booking-projects -- --dry --categories   # report only
 *   npm run db:backfill-booking-projects -- --categories         # first run after deploying
 *   npm run db:backfill-booking-projects                         # later runs (safe to repeat)
 *
 * --categories marks categories whose name sounds like a production (wedding, event...) as
 * Production, as they behaved before. Use it on the first run only.
 */
import { db } from "@/lib/db";
import { backfillBookingProjects } from "@/lib/bookings/backfill-projects";

async function main() {
  const dryRun = process.argv.includes("--dry");
  const res = await backfillBookingProjects(db, { dryRun, carryOverCategories: process.argv.includes("--categories") });
  for (const c of res.categories) console.log(`${c.tenantSlug}: category "${c.name}" (${c.slug}) -> Production`);
  for (const p of res.created) {
    console.log(`${p.tenantSlug}: ${p.trackingCode} -> ${p.projectNumber ?? "new"} ${p.kind} (${p.status})`);
  }
  const verb = dryRun ? "Would" : "Did";
  console.log(`${verb} mark ${res.categories.length} category(ies) Production and create ${res.created.length} project(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

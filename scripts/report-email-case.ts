/**
 * Prints how emails are stored (see lib/maintenance/email-case-report.ts). Read-only.
 * Run it inside the app: node scripts/ops.mjs email-report
 */
import { PrismaClient } from "@prisma/client";
import { findEmailCaseIssues } from "../lib/maintenance/email-case-report";

async function main() {
  const db = new PrismaClient();
  try {
    const r = await findEmailCaseIssues(db);
    console.log(`Accounts: ${r.users.total}. With capital letters or spaces: ${r.users.mixedCase.length}.`);
    console.log(`Bookings: ${r.bookings.total}. With capital letters or spaces: ${r.bookings.mixedCase}.`);
    console.log(`The same address in two spellings, in one studio: ${r.users.duplicates.length}.`);
    for (const u of r.users.mixedCase) console.log(`  mixed case  ${u.tenantSlug ?? "(platform)"}  ${u.role}  ${u.email}  (${u.id})`);
    for (const d of r.users.duplicates) {
      console.log(`  duplicate   ${d.tenantSlug ?? "(platform)"}  ${d.email}`);
      for (const a of d.accounts) console.log(`      ${a.role}  ${a.email}  (${a.id})`);
    }
    if (!r.users.mixedCase.length && !r.users.duplicates.length && !r.bookings.mixedCase) console.log("Nothing to clean up.");
    console.log("\nNothing was changed. Merge any duplicates by hand, then ask for the clean-up.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

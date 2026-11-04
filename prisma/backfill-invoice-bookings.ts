/**
 * One-off backfill: link existing BOOKING_DEPOSIT invoices to their booking
 * (MilestoneInvoice.bookingId), for invoices created before the link existed.
 *
 * Matching follows lib/bookings/details.ts: the tracking code in the invoice
 * reference, else the same client's booking created in the same transaction.
 * Only fills empty links; never changes an existing one. Safe to re-run.
 *
 *   npm run db:backfill-invoice-bookings            # apply
 *   npm run db:backfill-invoice-bookings -- --dry   # report only
 */
import { db } from "@/lib/db";
import { loadBookingDetails } from "@/lib/bookings/details";

async function main() {
  const dryRun = process.argv.includes("--dry");
  const tenants = await db.tenant.findMany({ select: { id: true, slug: true } });
  let linked = 0;

  for (const tenant of tenants) {
    const details = await loadBookingDetails(tenant.id);
    for (const booking of details) {
      if (!booking.invoice) continue;
      const invoice = await db.milestoneInvoice.findUnique({
        where: { id: booking.invoice.id },
        select: { bookingId: true, invoiceNumber: true },
      });
      if (!invoice || invoice.bookingId) continue;
      console.log(`${tenant.slug}: ${invoice.invoiceNumber} -> ${booking.trackingCode}`);
      if (!dryRun) {
        await db.milestoneInvoice.update({ where: { id: booking.invoice.id }, data: { bookingId: booking.id } });
      }
      linked += 1;
    }
  }

  const unlinked = await db.milestoneInvoice.count({ where: { milestoneType: "BOOKING_DEPOSIT", bookingId: null } });
  console.log(`${dryRun ? "Would link" : "Linked"} ${linked} invoice(s). Deposit invoices still unlinked: ${unlinked - (dryRun ? linked : 0)}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

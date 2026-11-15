import { db } from "@/lib/db";

/** The counts on the client portal's top bar tabs. Not a "use server" module. */
export async function loadClientHeaderBadges(tenantId: string, clientId: string) {
  const [unpaidInvoices, activeBookings, projects, proposals] = await Promise.all([
    db.milestoneInvoice.count({ where: { tenantId, clientId, status: { in: ["PENDING", "OVERDUE"] } } }),
    db.clientBooking.count({ where: { tenantId, userId: clientId, status: { in: ["CONFIRMED", "PENDING"] } } }),
    db.project.count({ where: { tenantId, clientId } }),
    db.proposal.count({ where: { tenantId, clientId } }),
  ]);
  return { unpaidInvoices, activeBookings, projects, proposals };
}

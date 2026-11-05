import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { resolveInvoiceBooking } from "@/lib/bookings/invoice-booking";
import { AdminVerificationConsole } from "@/components/checkout/admin-verification-console";
import { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";

interface VerificationPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: VerificationPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { name: true },
  });

  if (!tenant) return { title: "Verification | CineFlow OS" };

  return {
    title: `Manual Payment Verification Console | ${tenant.name}`,
    description: "Audit offline QR receipts and cash counter orders to lock slots and unlock project deliverables.",
  };
}

export default async function AdminVerificationPage({ params }: VerificationPageProps) {
  const { tenantSlug } = await params;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
    },
  });

  if (!tenant) notFound();

  // 2. Fetch Pending Invoices
  const pendingInvoices = await db.milestoneInvoice.findMany({
    where: {
      tenantId: tenant.id,
      status: "PENDING_VERIFICATION",
    },
    include: {
      client: true,
      project: true,
      booking: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // 3. The booking each deposit invoice pays for (explicit link; resolved for older invoices)
  const enrichedPending = await Promise.all(
    pendingInvoices.map(async (inv) => {
      const linked = inv.booking ?? (inv.milestoneType === "BOOKING_DEPOSIT" ? await resolveInvoiceBooking(db, inv) : null);
      const slot = linked?.slotId ? await db.bookingSlot.findUnique({ where: { id: linked.slotId } }) : null;
      const { booking: _omit, ...rest } = inv;
      return {
        ...rest,
        booking: linked
          ? {
              id: linked.id,
              trackingCode: linked.trackingCode,
              category: linked.category,
              targetDate: linked.targetDate,
              slot: slot ? { startTime: slot.startTime, endTime: slot.endTime } : null,
            }
          : null,
      };
    })
  );

  // 4. Fetch Settlement History (PAID, REJECTED, VOID)
  const historyInvoices = await db.milestoneInvoice.findMany({
    where: {
      tenantId: tenant.id,
      status: { in: ["PAID", "REJECTED", "VOID"] },
    },
    include: {
      client: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const user = await getCurrentUser();

  return (
    <AdminVerificationConsole
      tenant={tenant}
      verifierName={user?.name ?? "Studio staff"}
      pendingInvoices={enrichedPending}
      historyInvoices={historyInvoices}
    />
  );
}

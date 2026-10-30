import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AdminVerificationConsole } from "@/components/checkout/admin-verification-console";
import { Metadata } from "next";

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
    },
    orderBy: { createdAt: "desc" },
  });

  // 3. Fetch Linked Bookings for Client Identification
  const clientIds = pendingInvoices.map((i) => i.clientId);
  const bookings = await db.clientBooking.findMany({
    where: {
      tenantId: tenant.id,
      userId: { in: clientIds },
    },
    include: {
      slot: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Map each invoice to its booking
  const enrichedPending = pendingInvoices.map((inv) => {
    const linkedBooking = bookings.find((b) => b.userId === inv.clientId);
    return {
      ...inv,
      booking: linkedBooking
        ? {
            id: linkedBooking.id,
            trackingCode: linkedBooking.trackingCode,
            category: linkedBooking.category,
            targetDate: linkedBooking.targetDate,
            slot: linkedBooking.slot
              ? {
                  startTime: linkedBooking.slot.startTime,
                  endTime: linkedBooking.slot.endTime,
                }
              : null,
          }
        : null,
    };
  });

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

  return (
    <AdminVerificationConsole
      tenant={tenant}
      pendingInvoices={enrichedPending}
      historyInvoices={historyInvoices}
    />
  );
}

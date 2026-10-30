import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { CalendarAdminDashboard } from "@/components/admin/calendar/calendar-admin-dashboard";
import type { BookingSlotRow, CategoryOption } from "@/components/admin/calendar/single-slot-dialog";

interface CalendarPageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

export async function generateMetadata({
  params,
}: CalendarPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { title: "Calendar Not Found" };

  return {
    title: `Calendar Inventory & Holding Engine | ${tenant.name} Studio Admin`,
    description: "Manage shooting availability, time windows, batch scheduling, and slot lease holds.",
  };
}

export default async function AdminCalendarPage({ params }: CalendarPageProps) {
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

  // 2. Proactive hold expiration cleanup
  const now = new Date();
  await db.bookingSlot.updateMany({
    where: {
      tenantId: tenant.id,
      status: "HELD",
      heldUntil: { lt: now },
    },
    data: {
      status: "AVAILABLE",
      heldUntil: null,
      heldBySessionId: null,
    },
  });

  // 3. Fetch scoped slots with linked client bookings
  const slots = await db.bookingSlot.findMany({
    where: { tenantId: tenant.id },
    include: {
      booking: {
        select: {
          id: true,
          clientName: true,
          clientEmail: true,
          clientPhone: true,
          trackingCode: true,
          status: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  // 4. Fetch categories for assignment dropdowns
  const categories = await db.campaignCategory.findMany({
    where: { tenantId: tenant.id },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <CalendarAdminDashboard
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        initialSlots={slots as unknown as BookingSlotRow[]}
        categories={categories as unknown as CategoryOption[]}
      />
    </div>
  );
}

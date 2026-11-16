import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { loadAssignableFor } from "@/lib/team/members";
import { bookingActionPowers } from "@/lib/auth/page-powers";
import { NoAccess } from "@/components/admin/no-access";
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
    title: `Calendar | ${tenant.name} Studio Admin`,
    description: "Manage shooting availability, time windows, batch scheduling, and slot lease holds.",
  };
}

// Bookings VIEW sees the calendar; changing it needs Bookings MANAGE.
export default async function AdminCalendarPage({ params }: CalendarPageProps) {
  const { tenantSlug } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.bookings, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;
  const canManage = levelAtLeast(viewer.access.areas.bookings, "MANAGE");
  // A booked session's price and deposit are money: Invoices VIEW. The slot's own published fee stays.
  const money = levelAtLeast(viewer.access.areas.invoices, "VIEW");

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
  const rows = await db.bookingSlot.findMany({
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
          packageName: true,
          sessionPrice: true,
          depositAmount: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  const slots = money
    ? rows
    : rows.map((s) => ({
        ...s,
        booking: s.booking ? { ...s.booking, sessionPrice: null, depositAmount: null, moneyHidden: true } : null,
      }));

  // 4. Fetch categories for assignment dropdowns
  const categories = await db.campaignCategory.findMany({
    where: { tenantId: tenant.id },
    orderBy: { sortOrder: "asc" },
  });

  // 5. Customer accounts the admin can book on behalf of (only for those who may book)
  const clients = canManage
    ? await db.user.findMany({
        where: { tenantId: tenant.id, role: "CLIENT" },
        select: { id: true, name: true, email: true, phone: true },
        orderBy: { name: "asc" },
        take: 1000,
      })
    : [];

  // 6. Service packages (set a booking's price and deposit)
  const packages = await db.servicePackage.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, category: true, price: true, depositPrice: true, description: true, deliverables: true, discipline: true },
    orderBy: { price: "asc" },
  });

  const assignable = await loadAssignableFor(tenant.id, canManage);

  return (
    <PageShell>
      <CalendarAdminDashboard
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        initialSlots={slots as unknown as BookingSlotRow[]}
        categories={categories as unknown as CategoryOption[]}
        clients={clients}
        packages={packages}
        canManage={canManage}
        assignable={assignable}
        canSetPrices={viewer.access.ticks.setPrices}
        canRecordPayments={viewer.access.ticks.recordPayments}
        actionPowers={bookingActionPowers(viewer.access)}
      />
    </PageShell>
  );
}

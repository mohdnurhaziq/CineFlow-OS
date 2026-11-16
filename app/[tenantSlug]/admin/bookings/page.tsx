import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { loadAdminBookings } from "@/lib/bookings/admin-list";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";
import { BookingsConsole, type FilterId } from "@/components/admin/bookings/bookings-console";
import { loadBookableSlots } from "@/lib/bookings/bookable-slots";
import { loadAssignableFor } from "@/lib/team/members";
import { bookingActionPowers } from "@/lib/auth/page-powers";
import { studioNow } from "@/lib/slot-time";

interface BookingsPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ filter?: string }>;
}

export async function generateMetadata({ params }: BookingsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Bookings | ${tenant.name} Studio Admin` : "Bookings" };
}

// Bookings access; at "Only their own", the list holds only the bookings they are assigned to.
export default async function AdminBookingsPage({ params, searchParams }: BookingsPageProps) {
  const { tenantSlug } = await params;
  const { filter } = await searchParams;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.bookings, "OWN")) return <NoAccess tenantSlug={tenantSlug} />;
  // "New booking" is for Bookings MANAGE: only they get the open slots and the client list.
  const canManage = levelAtLeast(viewer.access.areas.bookings, "MANAGE");

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, currency: true },
  });
  if (!tenant) notFound();

  const [bookings, slots, categories, clients, packages, assignable] = await Promise.all([
    loadAdminBookings(tenant.id, { id: viewer.user.id, access: viewer.access }),
    // "New booking": open sessions, plus what the customer form needs (as on the Calendar page).
    canManage ? loadBookableSlots(tenant.id) : [],
    db.campaignCategory.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, slug: true, badgeIcon: true },
      orderBy: { sortOrder: "asc" },
    }),
    canManage
      ? db.user.findMany({
          where: { tenantId: tenant.id, role: "CLIENT" },
          select: { id: true, name: true, email: true, phone: true },
          orderBy: { name: "asc" },
          take: 1000,
        })
      : [],
    canManage
      ? db.servicePackage.findMany({
          where: { tenantId: tenant.id },
          select: { id: true, name: true, category: true, price: true, depositPrice: true, description: true, deliverables: true, discipline: true },
          orderBy: { price: "asc" },
        })
      : [],
    // Who can be put on a booking: only needed to add people (Bookings MANAGE).
    loadAssignableFor(tenant.id, canManage),
  ]);

  return (
    <PageShell>
      <BookingsConsole
        tenantSlug={tenant.slug}
        tenantId={tenant.id}
        canManage={canManage}
        canRecordPayments={viewer.access.ticks.recordPayments}
        actionPowers={bookingActionPowers(viewer.access)}
        currency={tenant.currency}
        bookings={bookings}
        today={studioNow().dateKey}
        initialFilter={filter === "unassigned" ? ("unassigned" satisfies FilterId) : undefined}
        assignable={assignable}
        newBooking={{ slots, categories, clients, packages }}
      />
    </PageShell>
  );
}

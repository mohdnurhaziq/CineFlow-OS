import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { loadBookingDetails } from "@/lib/bookings/details";
import { currentUserIsOwner } from "@/lib/auth/owner";
import { BookingsConsole } from "@/components/admin/bookings/bookings-console";
import { loadBookableSlots } from "@/lib/bookings/bookable-slots";

interface BookingsPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: BookingsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Bookings | ${tenant.name} Studio Admin` : "Bookings" };
}

/** Local calendar date as YYYY-MM-DD. */
function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Access is enforced by the admin layout (studio staff or super-admin only).
export default async function AdminBookingsPage({ params }: BookingsPageProps) {
  const { tenantSlug } = await params;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, currency: true },
  });
  if (!tenant) notFound();

  const [bookings, slots, categories, clients, packages] = await Promise.all([
    loadBookingDetails(tenant.id),
    // "New booking": open sessions, plus what the customer form needs (as on the Calendar page).
    loadBookableSlots(tenant.id),
    db.campaignCategory.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, slug: true, badgeIcon: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.user.findMany({
      where: { tenantId: tenant.id, role: "CLIENT" },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    db.servicePackage.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, category: true, price: true, depositPrice: true, description: true, deliverables: true, discipline: true },
      orderBy: { price: "asc" },
    }),
  ]);

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <BookingsConsole
        tenantSlug={tenant.slug}
        tenantId={tenant.id}
        isOwner={await currentUserIsOwner()}
        currency={tenant.currency}
        bookings={bookings}
        today={todayIso()}
        newBooking={{ slots, categories, clients, packages }}
      />
    </div>
  );
}

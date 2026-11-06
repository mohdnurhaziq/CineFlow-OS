import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { loadBookingDetails } from "@/lib/bookings/details";
import { currentUserIsOwner } from "@/lib/auth/owner";
import { BookingsConsole } from "@/components/admin/bookings/bookings-console";

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

  const bookings = await loadBookingDetails(tenant.id);

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <BookingsConsole
        tenantSlug={tenant.slug}
        tenantId={tenant.id}
        isOwner={await currentUserIsOwner()}
        currency={tenant.currency}
        bookings={bookings}
        today={todayIso()}
      />
    </div>
  );
}

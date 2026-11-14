import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { loadBookingDetails } from "@/lib/bookings/details";
import { currentUserIsOwner } from "@/lib/auth/owner";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { BookingDetailView } from "@/components/admin/bookings/booking-detail-view";

interface BookingPageProps {
  params: Promise<{ tenantSlug: string; bookingId: string }>;
}

export async function generateMetadata({ params }: BookingPageProps): Promise<Metadata> {
  const { tenantSlug, bookingId } = await params;
  const booking = await db.clientBooking.findFirst({
    where: { id: bookingId, tenant: { slug: tenantSlug } },
    select: { trackingCode: true, clientName: true, tenant: { select: { name: true } } },
  });
  return {
    title: booking ? `${booking.trackingCode} · ${booking.clientName} | ${booking.tenant.name} Studio Admin` : "Booking",
  };
}

// Access is enforced by the admin layout (studio staff or super-admin only). The booking is
// looked up within this studio, so another studio's booking id gives a 404.
export default async function AdminBookingPage({ params }: BookingPageProps) {
  const { tenantSlug, bookingId } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, currency: true },
  });
  if (!tenant) notFound();

  const [booking] = await loadBookingDetails(tenant.id, { bookingId });
  if (!booking) notFound();

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 max-w-3xl mx-auto space-y-4">
      <AdminBreadcrumb
        items={[
          { label: "Production" },
          { label: "Bookings", href: `/${tenant.slug}/admin/bookings` },
          { label: booking.trackingCode },
        ]}
      />
      <BookingDetailView
        booking={booking}
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        isOwner={await currentUserIsOwner()}
      />
    </div>
  );
}

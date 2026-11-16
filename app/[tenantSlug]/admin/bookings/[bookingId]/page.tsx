import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { loadBookingDetails } from "@/lib/bookings/details";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { canAccessBooking } from "@/lib/auth/access-guard";
import { NoAccess } from "@/components/admin/no-access";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { IncludedPrintsCard } from "@/components/admin/bookings/included-prints-card";
import { remainingForLines } from "@/lib/prints/entitlements";
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

// Bookings access; at "Only their own", only a booking they are assigned to. The booking is
// looked up within this studio, so another studio's booking id gives a 404.
export default async function AdminBookingPage({ params }: BookingPageProps) {
  const { tenantSlug, bookingId } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, currency: true },
  });
  if (!tenant) notFound();
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.bookings, "OWN")) return <NoAccess tenantSlug={tenantSlug} />;
  if (!(await db.clientBooking.findFirst({ where: { id: bookingId, tenantId: tenant.id }, select: { id: true } }))) notFound();
  if (!(await canAccessBooking(viewer.user, viewer.access, tenant.id, bookingId))) return <NoAccess tenantSlug={tenantSlug} />;

  const [booking] = await loadBookingDetails(tenant.id, { bookingId });
  if (!booking) notFound();
  const canManage = levelAtLeast(viewer.access.areas.bookings, "MANAGE");

  const [lines, sizes, frames] = await Promise.all([
    db.bookingIncludedPrint.findMany({ where: { bookingId: booking.id, tenantId: tenant.id }, orderBy: { createdAt: "asc" } }),
    db.printSize.findMany({ where: { tenantId: tenant.id, isAvailable: true }, orderBy: { basePrice: "asc" } }),
    db.frameDesign.findMany({ where: { tenantId: tenant.id, isAvailable: true }, orderBy: { name: "asc" } }),
  ]);
  const remaining = await remainingForLines(db, lines.map((l) => l.id));

  return (
    <PageShell width="document" className="space-y-4">
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
        canManage={canManage}
        canRecordPayments={viewer.access.ticks.recordPayments}
      />
      <IncludedPrintsCard
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        bookingId={booking.id}
        lines={lines.map((l) => ({
          id: l.id,
          sizeName: l.sizeName,
          sizeCode: l.sizeCode,
          frameName: l.frameName,
          quantity: l.quantity,
          source: l.source,
          note: l.note,
          claimed: l.quantity - (remaining.get(l.id) ?? 0),
        }))}
        sizes={sizes.map((s) => ({ id: s.id, label: `${s.name} (${s.widthInches}x${s.heightInches} in)` }))}
        frames={frames.map((f) => ({ id: f.id, label: f.name }))}
        canManage={canManage}
      />
    </PageShell>
  );
}

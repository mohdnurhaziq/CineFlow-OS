import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { remainingForLines } from "@/lib/prints/entitlements";
import { studioPath } from "@/lib/domain-name";
import { ClientBookingDetailView } from "@/components/account/client-booking-detail-view";

interface ClientBookingPageProps {
  params: Promise<{ tenantSlug: string; bookingId: string }>;
}

export async function generateMetadata({ params }: ClientBookingPageProps): Promise<Metadata> {
  const { tenantSlug, bookingId } = await params;
  const booking = await db.clientBooking.findFirst({
    where: { id: bookingId, tenant: { slug: tenantSlug } },
    select: { trackingCode: true, category: true, tenant: { select: { name: true } } },
  });

  return {
    title: booking
      ? `Booking #${booking.trackingCode} | ${booking.tenant.name}`
      : "Booking Details",
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function ClientBookingPage({ params }: ClientBookingPageProps) {
  const { tenantSlug, bookingId } = await params;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      brandColor: true,
      currency: true,
      discipline: true,
      tagline: true,
      bio: true,
      logoUrl: true,
      bankDetails: true,
    },
  });
  if (!tenant) notFound();

  const self = studioPath(tenant.slug, `/account/bookings/${bookingId}`);
  const session = await getCurrentUser();
  if (!session) {
    redirect(studioPath(tenant.slug, `/login?callbackUrl=${encodeURIComponent(self)}`));
  }

  // Studio staff belong in the admin console
  if (session.role !== "CLIENT") {
    redirect(studioPath(tenant.slug, `/admin/bookings/${bookingId}`));
  }
  if (session.tenantId !== tenant.id) {
    redirect(studioPath(tenant.slug, `/login?callbackUrl=${encodeURIComponent(self)}`));
  }

  // Load client's booking (strictly scoped to this tenant and authenticated client)
  const booking = await db.clientBooking.findFirst({
    where: {
      id: bookingId,
      tenantId: tenant.id,
      OR: [{ userId: session.id }, { clientEmail: session.email }],
    },
    include: {
      slot: true,
      package: true,
      invoices: {
        orderBy: { createdAt: "asc" },
      },
      includedPrints: {
        orderBy: { createdAt: "asc" },
      },
      assignments: {
        orderBy: { createdAt: "asc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              teamRole: { select: { name: true } },
            },
          },
        },
      },
      project: {
        include: {
          deliverables: {
            include: {
              items: {
                select: {
                  id: true,
                  title: true,
                  itemType: true,
                  previewUrl: true,
                  thumbnailUrl: true,
                  isClientFav: true,
                },
              },
            },
          },
          callSheets: {
            orderBy: { shootDate: "asc" },
          },
        },
      },
    },
  });

  if (!booking) notFound();

  // Also query any milestone invoices that might be related by trackingCode or project
  const existingInvoiceIds = new Set(booking.invoices.map((i) => i.id));
  const relatedInvoices = await db.milestoneInvoice.findMany({
    where: {
      tenantId: tenant.id,
      clientId: session.id,
      id: { notIn: Array.from(existingInvoiceIds) },
      OR: [
        { paymentReference: { contains: booking.trackingCode } },
        ...(booking.project ? [{ projectId: booking.project.id }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const allInvoices = [...booking.invoices, ...relatedInvoices];

  // Calculate remaining prints for included prints
  const remainingMap = await remainingForLines(
    db,
    booking.includedPrints.map((p) => p.id)
  );

  const printsWithRemaining = booking.includedPrints.map((p) => ({
    ...p,
    remaining: remainingMap.get(p.id) ?? p.quantity,
    claimed: Math.max(0, p.quantity - (remainingMap.get(p.id) ?? p.quantity)),
  }));

  const [categories, studioOwner] = await Promise.all([
    db.campaignCategory.findMany({
      where: { tenantId: tenant.id },
      select: { slug: true, name: true },
    }),
    db.user.findFirst({
      where: { tenantId: tenant.id, role: "STUDIO_OWNER" },
      select: { name: true, email: true, phone: true },
    }),
  ]);

  return (
    <ClientBookingDetailView
      tenant={tenant}
      booking={{
        ...booking,
        invoices: allInvoices,
        includedPrints: printsWithRemaining,
      }}
      categories={categories}
      studioOwner={studioOwner}
    />
  );
}

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { CinemaBookingShell } from "@/components/booking/cinema-booking-shell";
import { StudioPageHeader } from "@/components/layout/studio-page-header";
import { getSessionClient } from "@/lib/clients";
import { isSlotInPast, studioNow } from "@/lib/slot-time";
import { expireUnpaidDeposits } from "@/lib/bookings/expiry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface BookingPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ category?: string; packageId?: string }>;
}

export async function generateMetadata({ params }: BookingPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { name: true },
  });

  if (!tenant) return { title: "Booking" };

  return {
    title: `Cinema Calendar Booking — ${tenant.name}`,
    description: `Book your session with ${tenant.name} online: pick a date and time that suits you.`,
  };
}

export default async function BookingPage({ params, searchParams }: BookingPageProps) {
  const { tenantSlug } = await params;
  const { category: initialCategory, packageId: initialPackageId } = await searchParams;

  // 1. Resolve Tenant strictly by slug
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      discipline: true,
      currency: true,
      brandColor: true,
      tagline: true,
      subscriptionStatus: true,
    },
  });

  if (!tenant || tenant.subscriptionStatus === "CANCELLED") {
    notFound();
  }

  // 2. Proactive auto-cleanup of expired holds
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

  // 3. Fetch scoped categories
  const categories = await db.campaignCategory.findMany({
    where: { tenantId: tenant.id, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      badgeIcon: true,
    },
  });

  // Release slots whose QR/cash deposit went unpaid for 24 hours.
  await expireUnpaidDeposits(tenant.id, now);

  // Packages set the price and deposit of a booking.
  const packages = await db.servicePackage.findMany({
    where: { tenantId: tenant.id, isActive: true },
    select: { id: true, name: true, category: true, price: true, depositPrice: true, description: true, deliverables: true },
    orderBy: { price: "asc" },
  });

  // 4. Fetch upcoming slots only: sessions that have already started can't be booked.
  const today = studioNow(now);
  const slots = (
    await db.bookingSlot.findMany({
      where: { tenantId: tenant.id, date: { gte: new Date(`${today.dateKey}T00:00:00.000Z`) } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    })
  ).filter((slot) => !isSlotInPast(slot, now));

  // 5. The signed-in client of this studio, if any: they book as themselves.
  const client = await getSessionClient(tenant.id);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      {/* A client keeps their account's bar while booking; visitors and the team see the website's. */}
      <StudioPageHeader tenantSlug={tenant.slug} staffView="website" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <CinemaBookingShell
          clientAccount={client ? { name: client.name, email: client.email, phone: client.phone ?? "" } : null}
          tenant={tenant}
          categories={categories}
          initialSlots={slots}
          initialCategory={initialCategory || "all"}
          initialPackageId={initialPackageId}
          packages={packages}
        />
      </main>
    </div>
  );
}

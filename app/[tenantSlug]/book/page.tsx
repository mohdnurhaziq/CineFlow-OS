import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { CinemaBookingShell } from "@/components/booking/cinema-booking-shell";

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

  if (!tenant) return { title: "Booking | CineFlow OS" };

  return {
    title: `Cinema Calendar Booking — ${tenant.name}`,
    description: `Reserve your production slot for ${tenant.name} with 10-minute exclusive hold lock.`,
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

  // 4. Fetch scoped slots
  const slots = await db.bookingSlot.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <CinemaBookingShell
          tenant={tenant}
          categories={categories}
          initialSlots={slots}
          initialCategory={initialCategory || "all"}
          initialPackageId={initialPackageId}
        />
      </main>
    </div>
  );
}

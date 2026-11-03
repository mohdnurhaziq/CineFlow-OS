import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { MyBookingLookup } from "@/components/booking/my-booking-lookup";

interface MyBookingPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ code?: string }>;
}

export async function generateMetadata({ params }: MyBookingPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { name: true },
  });
  return {
    title: tenant ? `My Booking | ${tenant.name}` : "My Booking | CineFlow OS",
    description: "Look up your booking status, invoices, proposals and delivery vault.",
    robots: { index: false, follow: false },
  };
}

export default async function MyBookingPage({ params, searchParams }: MyBookingPageProps) {
  const { tenantSlug } = await params;
  const { code } = await searchParams;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { name: true, slug: true },
  });

  if (!tenant) notFound();

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex items-start justify-center px-4 py-12 selection:bg-amber-500/20 selection:text-amber-400">
      <MyBookingLookup
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        initialCode={typeof code === "string" ? code.slice(0, 40) : ""}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import Link from "next/link";
import { MyBookingLookup } from "@/components/booking/my-booking-lookup";
import { getSessionClient } from "@/lib/clients";

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
    title: tenant ? `My Booking | ${tenant.name}` : "My Booking",
    description: "Look up your booking status, invoices, proposals and delivery vault.",
    robots: { index: false, follow: false },
  };
}

export default async function MyBookingPage({ params, searchParams }: MyBookingPageProps) {
  const { tenantSlug } = await params;
  const { code } = await searchParams;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!tenant) notFound();

  // A signed-in client already has every booking in their account; point them there first.
  const client = await getSessionClient(tenant.id);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col items-center px-4 py-12 gap-6 selection:bg-amber-500/20 selection:text-amber-400">
      {client && (
        <div className="w-full max-w-2xl p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-semibold text-white">You&apos;re signed in as {client.name}</div>
            <div className="text-xs text-zinc-400">All your bookings, invoices and photos are in your account.</div>
          </div>
          <Link
            href={`/${tenant.slug}/account`}
            className="inline-flex items-center justify-center min-h-11 sm:min-h-0 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold whitespace-nowrap transition-colors"
          >
            Go to My Account
          </Link>
        </div>
      )}
      <MyBookingLookup
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        initialCode={typeof code === "string" ? code.slice(0, 40) : ""}
      />
    </div>
  );
}

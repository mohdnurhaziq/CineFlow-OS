import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { expireUnpaidDeposits } from "@/lib/bookings/expiry";
import { getCurrentUser } from "@/lib/auth/session";
import { ClientDashboard } from "@/components/account/client-dashboard";

interface AccountPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "My Account | CineFlow OS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ClientAccountPage({ params }: AccountPageProps) {
  const { tenantSlug } = await params;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true, currency: true },
  });
  if (!tenant) notFound();

  const session = await getCurrentUser();
  if (!session) redirect(`/${tenant.slug}/login?callbackUrl=${encodeURIComponent(`/${tenant.slug}/account`)}`);

  // Studio staff belong in the admin console, not the client dashboard.
  if (session.role !== "CLIENT") redirect(`/${tenant.slug}/admin`);
  if (session.tenantId !== tenant.id) redirect(`/${tenant.slug}/login`);

  const client = await db.user.findFirst({
    where: { id: session.id, tenantId: tenant.id, role: "CLIENT" },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!client) redirect(`/${tenant.slug}/login`);

  // Release slots whose QR/cash deposit went unpaid for 24 hours, so the client sees it.
  await expireUnpaidDeposits(tenant.id);

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [bookings, invoices, proposals, projects] = await Promise.all([
    db.clientBooking.findMany({
      where: { tenantId: tenant.id, userId: client.id },
      orderBy: { createdAt: "desc" },
      include: { slot: true },
    }),
    db.milestoneInvoice.findMany({
      where: { tenantId: tenant.id, clientId: client.id },
      orderBy: { createdAt: "desc" },
    }),
    db.proposal.findMany({
      where: { tenantId: tenant.id, clientId: client.id },
      orderBy: { createdAt: "desc" },
    }),
    db.project.findMany({
      where: { tenantId: tenant.id, clientId: client.id },
      orderBy: { createdAt: "desc" },
      include: {
        deliverables: { include: { items: { select: { itemType: true, isClientFav: true } } } },
        callSheets: {
          where: { shootDate: { gte: startOfToday } },
          orderBy: { shootDate: "asc" },
          take: 1,
          select: { title: true, shootDate: true, generalCallTime: true, locationName: true },
        },
      },
    }),
  ]);

  return (
    <ClientDashboard
      tenant={tenant}
      client={client}
      bookings={bookings}
      invoices={invoices}
      proposals={proposals}
      projects={projects}
    />
  );
}

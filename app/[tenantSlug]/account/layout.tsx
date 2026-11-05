import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { expireUnpaidDeposits } from "@/lib/bookings/expiry";
import { ClientAccountHeader } from "@/components/account/client-account-header";

interface ClientAccountLayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

export default async function ClientAccountLayout({ children, params }: ClientAccountLayoutProps) {
  const { tenantSlug } = await params;

  const [tenant, currentUser] = await Promise.all([
    db.tenant.findUnique({
      where: { slug: tenantSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        brandColor: true,
        discipline: true,
        currency: true,
      },
    }),
    getCurrentUser(),
  ]);

  if (!tenant) notFound();

  // Portal is for authenticated clients of this studio only
  if (!currentUser) {
    redirect(`/${tenantSlug}/login?callbackUrl=${encodeURIComponent(`/${tenantSlug}/account`)}`);
  }
  if (currentUser.role !== "CLIENT") {
    redirect(`/${tenantSlug}/admin`);
  }
  if (currentUser.tenantId !== tenant.id) {
    redirect(`/${tenantSlug}/login`);
  }

  // Release slots whose QR/cash deposit went unpaid for 24 hours before counting
  await expireUnpaidDeposits(tenant.id);

  // Fetch client user data and badge metrics in parallel
  const [client, unpaidInvoicesCount, activeBookingsCount, projectsCount, proposalsCount] = await Promise.all([
    db.user.findFirst({
      where: { id: currentUser.id, tenantId: tenant.id, role: "CLIENT" },
      select: { id: true, name: true, email: true, phone: true },
    }),
    db.milestoneInvoice.count({
      where: {
        tenantId: tenant.id,
        clientId: currentUser.id,
        status: { in: ["PENDING", "OVERDUE"] },
      },
    }),
    db.clientBooking.count({
      where: {
        tenantId: tenant.id,
        userId: currentUser.id,
        status: { in: ["CONFIRMED", "PENDING"] },
      },
    }),
    db.project.count({
      where: {
        tenantId: tenant.id,
        clientId: currentUser.id,
      },
    }),
    db.proposal.count({
      where: {
        tenantId: tenant.id,
        clientId: currentUser.id,
      },
    }),
  ]);

  if (!client) redirect(`/${tenantSlug}/login`);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col selection:bg-amber-500/20 selection:text-amber-400 print:bg-white print:min-h-0">
      <ClientAccountHeader
        tenant={tenant}
        client={client}
        badges={{
          unpaidInvoices: unpaidInvoicesCount,
          activeBookings: activeBookingsCount,
          projects: projectsCount,
          proposals: proposalsCount,
        }}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}

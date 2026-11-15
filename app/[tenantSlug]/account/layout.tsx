import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { expireUnpaidDeposits } from "@/lib/bookings/expiry";
import { ClientAccountHeader } from "@/components/account/client-account-header";
import { loadClientHeaderBadges } from "@/lib/client-header-badges";

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

  const [client, badges] = await Promise.all([
    db.user.findFirst({
      where: { id: currentUser.id, tenantId: tenant.id, role: "CLIENT" },
      select: { id: true, name: true, email: true, phone: true },
    }),
    loadClientHeaderBadges(tenant.id, currentUser.id),
  ]);

  if (!client) redirect(`/${tenantSlug}/login`);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col selection:bg-amber-500/20 selection:text-amber-400 print:bg-white print:min-h-0">
      <ClientAccountHeader
        tenant={tenant}
        client={client}
        badges={badges}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}

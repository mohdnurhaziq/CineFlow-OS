import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AdminHeader } from "@/components/admin/admin-header";
import { getCurrentUser } from "@/lib/auth/session";
import { expireUnpaidDeposits } from "@/lib/bookings/expiry";

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
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
      },
    }),
    getCurrentUser(),
  ]);

  if (!tenant) notFound();

  // Admin console is for this studio's staff (or platform super-admins) only.
  if (!currentUser) {
    redirect(`/${tenantSlug}/login?callbackUrl=${encodeURIComponent(`/${tenantSlug}/admin`)}`);
  }
  if (currentUser.role === "CLIENT") redirect(`/${tenantSlug}/account`);
  if (currentUser.role !== "SUPER_ADMIN" && currentUser.tenantId !== tenant.id) {
    redirect(`/${tenantSlug}/login?callbackUrl=${encodeURIComponent(`/${tenantSlug}/admin`)}`);
  }

  // Release slots whose QR/cash deposit went unpaid for 24 hours, before the menu counts them.
  await expireUnpaidDeposits(tenant.id);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col selection:bg-amber-500/20 selection:text-amber-400 print:bg-white print:min-h-0">
      <AdminHeader tenant={tenant} user={currentUser} />

      {/* Main Content Area */}
      <main className="flex-1">{children}</main>
    </div>
  );
}

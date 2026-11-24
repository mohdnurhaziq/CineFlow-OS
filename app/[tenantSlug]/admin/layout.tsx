import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AdminHeader } from "@/components/admin/admin-header";
import { getCurrentUser } from "@/lib/auth/session";
import { expireUnpaidDeposits } from "@/lib/bookings/expiry";
import { studioPath } from "@/lib/domain-name";
import { PlanBanner } from "@/components/billing/plan-banner";
import { loadPlanStatus, platformContactEmail } from "@/lib/billing/guard";

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
    redirect(studioPath(tenantSlug, `/login?callbackUrl=${encodeURIComponent(studioPath(tenantSlug, "/admin"))}`));
  }
  if (currentUser.role === "CLIENT") redirect(studioPath(tenantSlug, "/account"));
  if (currentUser.role !== "SUPER_ADMIN" && currentUser.tenantId !== tenant.id) {
    redirect(studioPath(tenantSlug, `/login?callbackUrl=${encodeURIComponent(studioPath(tenantSlug, "/admin"))}`));
  }

  // Release slots whose QR/cash deposit went unpaid for 24 hours, before the menu counts them.
  await expireUnpaidDeposits(tenant.id);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col selection:bg-amber-500/20 selection:text-amber-400 print:bg-white print:min-h-0">
      <AdminHeader tenant={tenant} user={currentUser} />
      {/* The studio's plan: a heads-up when it is ending, the stop notice when paused (never for platform staff). */}
      {currentUser.role !== "SUPER_ADMIN" && (
        <PlanBanner status={await loadPlanStatus(tenant.id)} contactEmail={await platformContactEmail()} />
      )}

      {/* Main Content Area */}
      <main className="flex-1">{children}</main>
    </div>
  );
}

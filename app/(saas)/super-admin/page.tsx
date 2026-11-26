import { notFound } from "next/navigation";
import { getPlatformMetrics, getAllTenantsSummary } from "@/lib/actions/super-admin";
import { listInviteRequests } from "@/lib/actions/invite-requests";
import { getCurrentUser } from "@/lib/auth/session";
import { getSystemHealth } from "@/lib/ops/system-health";
import { SuperAdminView } from "@/components/super-admin/super-admin-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Super-Admin Console",
  description: "Platform-wide operations, macro telemetry, and studio tenant management.",
  robots: { index: false, follow: false },
};

export default async function SuperAdminPage() {
  // Platform administrators only; everyone else gets a 404 so the console isn't advertised.
  const session = await getCurrentUser();
  if (session?.role !== "SUPER_ADMIN") notFound();

  const [metrics, tenants, invites, health] = await Promise.all([
    getPlatformMetrics(),
    getAllTenantsSummary(),
    listInviteRequests(),
    getSystemHealth(),
  ]);

  return <SuperAdminView metrics={metrics} tenants={tenants} invites={invites} health={health} />;
}

import { notFound } from "next/navigation";
import { getPlatformMetrics, getAllTenantsSummary } from "@/lib/actions/super-admin";
import { getCurrentUser } from "@/lib/auth/session";
import { SuperAdminView } from "@/components/super-admin/super-admin-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Super-Admin Console — CineFlow OS",
  description: "Platform-wide operations, macro telemetry, and studio tenant management.",
  robots: { index: false, follow: false },
};

export default async function SuperAdminPage() {
  // Platform administrators only; everyone else gets a 404 so the console isn't advertised.
  const session = await getCurrentUser();
  if (session?.role !== "SUPER_ADMIN") notFound();

  const [metrics, tenants] = await Promise.all([
    getPlatformMetrics(),
    getAllTenantsSummary(),
  ]);

  return <SuperAdminView metrics={metrics} tenants={tenants} />;
}

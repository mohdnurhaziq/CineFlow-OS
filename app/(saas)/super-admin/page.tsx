import { getPlatformMetrics, getAllTenantsSummary } from "@/lib/actions/super-admin";
import { SuperAdminView } from "@/components/super-admin/super-admin-view";

export const metadata = {
  title: "Super-Admin Console — CineFlow OS",
  description: "Platform-wide operations, macro telemetry, and studio tenant management.",
};

export default async function SuperAdminPage() {
  const [metrics, tenants] = await Promise.all([
    getPlatformMetrics(),
    getAllTenantsSummary(),
  ]);

  return <SuperAdminView metrics={metrics} tenants={tenants} />;
}

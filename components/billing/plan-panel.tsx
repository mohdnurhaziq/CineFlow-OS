import type { PlanFeature } from "@/lib/billing/plans";
import { hasFeature, platformContactEmail } from "@/lib/billing/guard";
import { UpgradePanel } from "@/components/billing/upgrade-panel";

/** The upgrade panel when the studio's plan lacks `feature` (never for a super-admin). Renders nothing otherwise. */
export async function PlanPanel({ tenantId, feature, role }: { tenantId: string; feature: PlanFeature; role: string }) {
  if (role === "SUPER_ADMIN" || (await hasFeature(tenantId, feature))) return null;
  return <UpgradePanel feature={feature} contactEmail={await platformContactEmail()} />;
}

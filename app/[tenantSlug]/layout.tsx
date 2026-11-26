import { notFound } from "next/navigation";
import { db } from "@/lib/db";

/**
 * Refuses an address with no studio. It has to happen here, above this folder's loading.tsx: once
 * that loading screen has been sent, the response is already "200 OK" and a page's own notFound()
 * can no longer say "404". Whether a closed studio's page shows is still each page's decision.
 */
export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const studio = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!studio) notFound();
  return children;
}

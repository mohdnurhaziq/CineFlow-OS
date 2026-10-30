import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { StudioSettingsForm, type StudioTenantData } from "@/components/admin/settings/studio-settings-form";

interface SettingsPageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

export async function generateMetadata({
  params,
}: SettingsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { title: "Settings Not Found" };

  return {
    title: `Studio Settings & Bank Details | ${tenant.name} Studio Admin`,
    description: "Manage studio identity, branding colors, bank payment wire info, and QR codes.",
  };
}

export default async function AdminSettingsPage({ params }: SettingsPageProps) {
  const { tenantSlug } = await params;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  if (!tenant) notFound();

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <StudioSettingsForm tenant={tenant as unknown as StudioTenantData} />
    </div>
  );
}

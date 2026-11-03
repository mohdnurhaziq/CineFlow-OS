import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSessionClient } from "@/lib/clients";
import { ClientRegisterCard } from "@/components/auth/client-register-card";

interface RegisterPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export const metadata: Metadata = {
  title: "Create Client Account | CineFlow OS",
  robots: { index: false, follow: false },
};

export default async function ClientRegisterPage({ params }: RegisterPageProps) {
  const { tenantSlug } = await params;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true, subscriptionStatus: true },
  });
  if (!tenant || tenant.subscriptionStatus === "CANCELLED") notFound();

  if (await getSessionClient(tenant.id)) redirect(`/${tenant.slug}/account`);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex items-center justify-center p-4 selection:bg-amber-500/20 selection:text-amber-400">
      <ClientRegisterCard tenantSlug={tenant.slug} tenantName={tenant.name} />
    </div>
  );
}

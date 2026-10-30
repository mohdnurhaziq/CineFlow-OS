import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { StudioLoginForm } from "@/components/auth/studio-login-form";

interface LoginPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function StudioLoginPage({ params }: LoginPageProps) {
  const { tenantSlug } = await params;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { name: true, slug: true },
  });

  if (!tenant) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex items-center justify-center p-4 selection:bg-amber-500/20 selection:text-amber-400">
      <StudioLoginForm tenantSlug={tenant.slug} tenantName={tenant.name} />
    </div>
  );
}

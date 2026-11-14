import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

interface ForgotPasswordPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ email?: string }>;
}

export async function generateMetadata({ params }: ForgotPasswordPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Forgot password | ${tenant.name}` : "Forgot password", robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage({ params, searchParams }: ForgotPasswordPageProps) {
  const { tenantSlug } = await params;
  const { email } = await searchParams;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true, slug: true } });
  if (!tenant) notFound();

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex items-center justify-center p-4 selection:bg-amber-500/20 selection:text-amber-400">
      <ForgotPasswordForm
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        initialEmail={typeof email === "string" ? email.slice(0, 254) : ""}
      />
    </div>
  );
}

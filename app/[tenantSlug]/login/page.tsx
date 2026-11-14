import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/guard";
import { getSessionClient } from "@/lib/clients";
import { StudioLoginForm } from "@/components/auth/studio-login-form";
import { SignedInRedirect } from "@/components/auth/signed-in-redirect";

interface LoginPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ callbackUrl?: string }>;
}

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Sign in | ${tenant.name}` : "Sign in", robots: { index: false, follow: false } };
}

export default async function StudioLoginPage({ params, searchParams }: LoginPageProps) {
  const { tenantSlug } = await params;
  const { callbackUrl } = await searchParams;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!tenant) {
    notFound();
  }

  // Already signed in to this studio: move on instead of showing the form again. Not a server
  // redirect, for the same reason as /register (signing in re-renders this page).
  const session = await getCurrentUser();
  // A client counts only if their account still exists (else /account would send them back here).
  const isClient = session?.role === "CLIENT" && !!(await getSessionClient(tenant.id));
  const isStaff =
    !!session && STAFF_ROLES.has(session.role) && (session.role === "SUPER_ADMIN" || session.tenantId === tenant.id);
  const safeCallback =
    typeof callbackUrl === "string" && callbackUrl.startsWith(`/${tenant.slug}`) && !callbackUrl.startsWith("//")
      ? callbackUrl
      : null;
  const isShowcaseRoot =
    safeCallback === `/${tenant.slug}` || safeCallback === `/${tenant.slug}/`;
  const target = isClient
    ? safeCallback && !safeCallback.includes("/admin") && !isShowcaseRoot
      ? safeCallback
      : `/${tenant.slug}/account`
    : safeCallback && !isShowcaseRoot
    ? safeCallback
    : `/${tenant.slug}/admin`;

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex items-center justify-center p-4 selection:bg-amber-500/20 selection:text-amber-400">
      {session && (isClient || isStaff) ? (
        <SignedInRedirect name={session.name} href={target} />
      ) : (
        <StudioLoginForm tenantSlug={tenant.slug} tenantName={tenant.name} />
      )}
    </div>
  );
}

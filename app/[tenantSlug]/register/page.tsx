import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSessionClient } from "@/lib/clients";
import { ClientRegisterCard } from "@/components/auth/client-register-card";
import { SignedInRedirect } from "@/components/auth/signed-in-redirect";

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

  // Signed-in clients go to their account. Not a server redirect: signing in on this page
  // re-renders it, and a redirect at that moment blanks the page until /account arrives.
  const client = await getSessionClient(tenant.id);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex items-center justify-center p-4 selection:bg-amber-500/20 selection:text-amber-400">
      {client ? (
        <SignedInRedirect name={client.name} href={`/${tenant.slug}/account`} />
      ) : (
        <ClientRegisterCard tenantSlug={tenant.slug} tenantName={tenant.name} />
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSessionClient } from "@/lib/clients";
import { inviteMatches } from "@/lib/auth/invite";
import { ClientRegisterCard } from "@/components/auth/client-register-card";
import { SignedInRedirect } from "@/components/auth/signed-in-redirect";

interface RegisterPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ invite?: string; email?: string; next?: string }>;
}

export const metadata: Metadata = {
  title: "Create Client Account",
  robots: { index: false, follow: false },
};

export default async function ClientRegisterPage({ params, searchParams }: RegisterPageProps) {
  const { tenantSlug } = await params;
  const { invite, email, next: rawNext } = await searchParams;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true, subscriptionStatus: true },
  });
  if (!tenant || tenant.subscriptionStatus === "CANCELLED") notFound();

  // Signed-in clients go to their account. Not a server redirect: signing in on this page
  // re-renders it, and a redirect at that moment blanks the page until /account arrives.
  const client = await getSessionClient(tenant.id);

  // A valid invite (from a booking or proposal email) belongs to an account the studio set up:
  // fill in the name and phone it already has. Only on a token match, so the link can't be used
  // to look up someone else's details.
  const inviteToken = typeof invite === "string" ? invite.slice(0, 100) : undefined;
  const inviteEmail = typeof email === "string" ? email.slice(0, 200).trim().toLowerCase() : undefined;
  const invited =
    !client && inviteToken && inviteEmail
      ? await db.user.findFirst({
          where: { tenantId: tenant.id, email: inviteEmail, role: "CLIENT", passwordHash: null },
          select: { name: true, phone: true, inviteToken: true, inviteTokenExpires: true },
        })
      : null;
  const prefill = invited && inviteMatches(invited, inviteToken) ? invited : null;

  // Only continue to a page inside this studio (never an outside site).
  const next =
    typeof rawNext === "string" && rawNext.startsWith(`/${tenant.slug}/`) && !rawNext.startsWith("//") && !rawNext.includes("/admin")
      ? rawNext
      : undefined;

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex items-center justify-center p-4 selection:bg-amber-500/20 selection:text-amber-400">
      {client ? (
        <SignedInRedirect name={client.name} href={next ?? `/${tenant.slug}/account`} />
      ) : (
        <ClientRegisterCard
          tenantSlug={tenant.slug}
          tenantName={tenant.name}
          inviteToken={inviteToken}
          defaultEmail={typeof email === "string" ? email.slice(0, 200) : undefined}
          defaultName={prefill?.name}
          defaultPhone={prefill?.phone ?? undefined}
          next={next}
        />
      )}
    </div>
  );
}

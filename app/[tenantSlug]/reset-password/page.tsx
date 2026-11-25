import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LinkIcon } from "lucide-react";
import { db } from "@/lib/db";
import { findStudioAccount, resetTokenMatches } from "@/lib/auth/password-reset";
import { findLogin } from "@/lib/auth/login";
import { googleConfigured } from "@/lib/auth/google";
import { googleInviteHref } from "@/lib/auth/google-links";
import { hasSetUp } from "@/lib/auth/set-up";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { studioPath } from "@/lib/domain-name";

interface ResetPasswordPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ token?: string; email?: string; welcome?: string; join?: string; google?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: ResetPasswordPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const welcome = (await searchParams).welcome === "1";
  const join = (await searchParams).join === "1";
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  const label = join ? "One sign-in" : welcome ? "Set your password" : "Reset password";
  return {
    title: tenant ? `${label} | ${tenant.name}` : label,
    robots: { index: false, follow: false },
    // The URL carries a one-time token: never send it to other sites as a referrer.
    referrer: "no-referrer",
  };
}

export default async function ResetPasswordPage({ params, searchParams }: ResetPasswordPageProps) {
  const { tenantSlug } = await params;
  const { token, email, welcome: welcomeParam, join: joinParam, google } = await searchParams;
  // "Use one sign-in for all your studios": the same one-time link, worded for choosing one password.
  const join = joinParam === "1";
  // A team invite: the same one-time link, worded as a welcome.
  const welcome = welcomeParam === "1";
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true, slug: true } });
  if (!tenant) notFound();

  // Checking the link here (without using it up) lets an expired link say so before the form.
  const account =
    typeof token === "string" && typeof email === "string" ? await findStudioAccount(tenant.id, email) : null;
  const valid = !!account && !account.deactivatedAt && resetTokenMatches(account, token);
  // They already have a CineFlow sign-in (from another studio): this password becomes its password.
  // A team invite can be accepted with Google, which proves the email the link can't.
  const pendingStaff = valid && !!account && !hasSetUp(account) && account.role !== "CLIENT" && account.role !== "STUDIO_OWNER" && account.role !== "SUPER_ADMIN";
  const googleHref = welcome && pendingStaff && googleConfigured() && account ? googleInviteHref(tenant.slug, account.email, token as string) : null;
  const hasLogin = valid && !!account && (!!account.loginId || !!(await findLogin(account.email)));

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex items-center justify-center p-4 selection:bg-amber-500/20 selection:text-amber-400">
      {valid && account ? (
        <ResetPasswordForm tenantSlug={tenant.slug} tenantName={tenant.name} email={account.email} token={token as string} welcome={welcome} join={join} hasLogin={hasLogin} googleHref={googleHref} googleError={google ?? null} />
      ) : (
        <div role="alert" className="w-full max-w-md p-8 rounded-2xl bg-[#121215] border border-zinc-800 shadow-2xl text-center space-y-4">
          <div className="size-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
            <LinkIcon className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{welcome ? "This invite link has expired" : "This reset link has expired"}</h1>
          <p className="text-sm text-zinc-400">
            {welcome
              ? "Invite links work once and expire after 30 days. Ask the studio for a new one, or request a new link below."
              : "Reset links work once and expire after an hour. Request a new one and use the latest email."}
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Link
              href={studioPath(tenant.slug, `/forgot-password${typeof email === "string" ? `?email=${encodeURIComponent(email)}` : ""}`)}
              className={buttonVariants({ size: "lg" })}
            >
              Send a new link
            </Link>
            <Link href={studioPath(tenant.slug, "/login")} className="text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors">
              ← Back to sign in
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

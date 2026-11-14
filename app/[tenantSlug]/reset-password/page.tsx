import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LinkIcon } from "lucide-react";
import { db } from "@/lib/db";
import { findStudioAccount, resetTokenMatches } from "@/lib/auth/password-reset";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

interface ResetPasswordPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ token?: string; email?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ResetPasswordPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return {
    title: tenant ? `Reset password | ${tenant.name}` : "Reset password",
    robots: { index: false, follow: false },
    // The URL carries a one-time token: never send it to other sites as a referrer.
    referrer: "no-referrer",
  };
}

export default async function ResetPasswordPage({ params, searchParams }: ResetPasswordPageProps) {
  const { tenantSlug } = await params;
  const { token, email } = await searchParams;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true, slug: true } });
  if (!tenant) notFound();

  // Checking the link here (without using it up) lets an expired link say so before the form.
  const account =
    typeof token === "string" && typeof email === "string" ? await findStudioAccount(tenant.id, email) : null;
  const valid = !!account && resetTokenMatches(account, token);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex items-center justify-center p-4 selection:bg-amber-500/20 selection:text-amber-400">
      {valid && account ? (
        <ResetPasswordForm tenantSlug={tenant.slug} tenantName={tenant.name} email={account.email} token={token as string} />
      ) : (
        <div role="alert" className="w-full max-w-md p-8 rounded-2xl bg-[#121215] border border-zinc-800 shadow-2xl text-center space-y-4">
          <div className="size-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
            <LinkIcon className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white">This reset link has expired</h1>
          <p className="text-sm text-zinc-400">
            Reset links work once and expire after an hour. Request a new one and use the latest email.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Link
              href={`/${tenant.slug}/forgot-password${typeof email === "string" ? `?email=${encodeURIComponent(email)}` : ""}`}
              className="inline-flex items-center justify-center min-h-11 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold uppercase tracking-wide transition-colors"
            >
              Send a new link
            </Link>
            <Link href={`/${tenant.slug}/login`} className="text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors">
              ← Back to sign in
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

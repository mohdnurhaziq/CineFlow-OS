import { getCurrentUser } from "@/lib/auth/session";
import { PlatformLoginForm } from "@/components/auth/platform-login-form";
import { SignedInRedirect } from "@/components/auth/signed-in-redirect";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Platform sign-in",
  robots: { index: false, follow: false },
};

/** Where the platform super-admin signs in. Studio teams and clients use their studio's page. */
export default async function PlatformLoginPage() {
  const session = await getCurrentUser();
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      {session?.role === "SUPER_ADMIN" ? (
        <SignedInRedirect name={session.name} href="/super-admin" />
      ) : (
        <PlatformLoginForm />
      )}
    </div>
  );
}

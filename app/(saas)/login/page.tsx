import { redirect } from "next/navigation";
import { getCurrentLogin } from "@/lib/auth/session";
import { PlatformAccountLoginForm } from "@/components/auth/platform-account-login-form";
import { googleConfigured } from "@/lib/auth/google";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in | CineFlow OS",
  robots: { index: false, follow: false },
};

/** Where a person signs in with their one CineFlow login, away from any one studio. */
export default async function AccountLoginPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  if (await getCurrentLogin()) redirect("/studios");
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <PlatformAccountLoginForm googleEnabled={googleConfigured()} googleError={google ?? null} />
    </div>
  );
}

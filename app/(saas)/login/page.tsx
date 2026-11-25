import { redirect } from "next/navigation";
import { getCurrentLogin } from "@/lib/auth/session";
import { PlatformAccountLoginForm } from "@/components/auth/platform-account-login-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in | CineFlow OS",
  robots: { index: false, follow: false },
};

/** Where a person signs in with their one CineFlow login, away from any one studio. */
export default async function AccountLoginPage() {
  if (await getCurrentLogin()) redirect("/studios");
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <PlatformAccountLoginForm />
    </div>
  );
}

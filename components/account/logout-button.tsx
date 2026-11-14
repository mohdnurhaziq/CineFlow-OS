"use client";

import { buttonVariants } from "@/components/ui/button";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/auth/session";
import { signedOutHref } from "@/lib/auth/signed-out";

export function LogoutButton({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await logoutAction();
        router.push(signedOutHref(redirectTo));
        router.refresh();
      }}
      className={buttonVariants({ variant: "secondary", size: "sm" })}
    >
      <LogOut className="size-3.5" />
      Sign out
    </button>
  );
}

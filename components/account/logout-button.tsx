"use client";

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
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-[#121215] text-zinc-300 hover:text-white hover:border-zinc-700 text-xs font-semibold transition-colors disabled:opacity-50"
    >
      <LogOut className="size-3.5" />
      Sign out
    </button>
  );
}

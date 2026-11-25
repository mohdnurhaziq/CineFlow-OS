"use client";

import { useTransition } from "react";
import { logoutAction } from "@/lib/auth/session";
import { signOutEverywhere } from "@/lib/actions/one-login";
import { signedOutHref } from "@/lib/auth/signed-out";

const button =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-60";

/** "Sign out" (this browser) and "Sign out everywhere" (every device) for the Your studios page. */
export function StudiosSignOut() {
  const [pending, startTransition] = useTransition();
  const go = (action: () => Promise<unknown>) =>
    startTransition(async () => {
      await action();
      window.location.href = signedOutHref("/login");
    });
  return (
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={pending} onClick={() => go(logoutAction)} className={button}>
        Sign out
      </button>
      <button type="button" disabled={pending} onClick={() => go(signOutEverywhere)} className={button}>
        Sign out everywhere
      </button>
    </div>
  );
}

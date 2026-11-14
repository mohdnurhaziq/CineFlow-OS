"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, UserRound } from "lucide-react";
import { logoutAction } from "@/lib/auth/session";

interface InviteForAnotherAccountProps {
  /** The email the set-password link was sent to. */
  inviteEmail: string;
  /** The client who is signed in on this browser. */
  signedInEmail: string;
  signedInName: string;
  /** This studio's account page, for "stay signed in". */
  accountHref: string;
}

/**
 * A set-password (invite) link opened while a different client is signed in on this browser.
 * Redirecting would quietly show the wrong account, so say whose link it is and offer to sign
 * out; the same link then shows the set-password form.
 */
export function InviteForAnotherAccount({ inviteEmail, signedInEmail, signedInName, accountHref }: InviteForAnotherAccountProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOutAndContinue = async () => {
    setBusy(true);
    await logoutAction();
    router.refresh(); // same URL, now signed out: the set-password form
  };

  return (
    <div role="alert" className="w-full max-w-md p-8 rounded-2xl bg-[#121215] border border-amber-500/30 shadow-2xl space-y-5 text-center">
      <UserRound className="size-8 text-amber-400 mx-auto" aria-hidden="true" />
      <div className="space-y-2">
        <h1 className="text-base font-bold text-white">This link is for another account</h1>
        <p className="text-xs text-zinc-400 leading-relaxed">
          It sets up the account for <strong className="text-zinc-200 break-all">{inviteEmail}</strong>, but you&apos;re signed in as{" "}
          <strong className="text-zinc-200">{signedInName}</strong> (<span className="break-all">{signedInEmail}</span>).
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={signOutAndContinue}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold text-xs"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <LogOut className="size-3.5" aria-hidden="true" />}
          Sign out and continue
        </button>
        <Link href={accountHref} className="text-xs font-mono text-zinc-400 hover:text-white py-1.5">
          Stay signed in, go to my account
        </Link>
      </div>
    </div>
  );
}

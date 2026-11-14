"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";

interface SignedInRedirectProps {
  name: string;
  href: string;
}

/**
 * Shown on sign-up / sign-in pages once the visitor is already signed in. A server redirect here
 * would race the re-render that follows a sign-in action and leave the page blank; this keeps a
 * visible "you're signed in" state while it moves on.
 */
export function SignedInRedirect({ name, href }: SignedInRedirectProps) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full max-w-md p-8 rounded-2xl bg-[#121215] border border-zinc-800 shadow-2xl text-center space-y-3"
    >
      <CheckCircle2 className="size-8 text-emerald-400 mx-auto" aria-hidden="true" />
      <div className="text-sm font-bold text-white">You&apos;re signed in as {name}</div>
      <p className="text-xs text-zinc-400 inline-flex items-center gap-1.5">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Taking you there…
      </p>
      <div>
        <Link href={href} className="text-xs font-mono text-amber-400 hover:text-amber-300">
          Go now →
        </Link>
      </div>
    </div>
  );
}

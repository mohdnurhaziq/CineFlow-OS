import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LandingMode } from "@/lib/landing/mode";

const primary =
  "inline-flex items-center justify-center gap-2.5 min-h-12 px-7 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-semibold text-sm tracking-tight transition-all focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300";
const secondary =
  "inline-flex items-center justify-center min-h-12 px-4 text-sm text-zinc-300 hover:text-white underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 rounded";

/** The page's main action, and its quieter companion, for how sign-up currently works. */
export function PrimaryCta({ mode }: { mode: LandingMode }) {
  return mode === "TRIAL" ? (
    <Link href="/create-studio" className={primary}>
      Start your 14-day free trial
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  ) : (
    <Link href="/#invite" className={primary}>
      Request an invite
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

export function SecondaryCta({ mode }: { mode: LandingMode }) {
  if (mode === "INVITE_WITH_CODE") {
    return (
      <Link href="/create-studio" className={secondary}>
        Have an invite code? Create your studio
      </Link>
    );
  }
  return (
    <Link href="/#how" className={secondary}>
      See how it works
    </Link>
  );
}

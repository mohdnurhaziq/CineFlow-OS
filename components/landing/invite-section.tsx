import Link from "next/link";
import type { LandingMode } from "@/lib/landing/mode";
import { InviteForm } from "@/components/landing/invite-form";
import { PrimaryCta } from "@/components/landing/cta-buttons";
import { SplitHeading } from "@/components/landing/split-heading";

/** The last call to action: the invite form, or (when sign-up is open) straight to the trial. */
export function InviteSection({ mode }: { mode: LandingMode }) {
  if (mode === "TRIAL") {
    return (
      <section className="border-t border-zinc-800/80 py-28 text-center sm:py-40">
        <div className="mx-auto max-w-3xl px-4">
          <SplitHeading text="Your studio," accent="running tomorrow." className="text-[clamp(2.75rem,8vw,6.5rem)]" />
          <div className="mt-10 flex justify-center">
            <PrimaryCta mode={mode} />
          </div>
        </div>
      </section>
    );
  }
  return (
    <section id="invite" aria-labelledby="invite-h" className="relative scroll-mt-20 border-t border-zinc-800/80 py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-5">
          <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.25em] text-amber-400">Private beta</p>
          <SplitHeading text="Ask for your" accent="invite." className="text-[clamp(2.75rem,7vw,6rem)]" />
          <h2 id="invite-h" className="sr-only">
            Request an invite
          </h2>
          <p data-reveal className="mt-6 max-w-md text-zinc-400">
            Tell us about your studio. We&apos;ll email you an invite to start your free trial.
          </p>
          {mode === "INVITE_WITH_CODE" && (
            <p data-reveal data-reveal-delay="0.1" className="mt-6">
              <Link href="/create-studio" className="inline-flex min-h-11 items-center text-amber-300 underline underline-offset-4 hover:text-amber-200">
                Have an invite code? Create your studio
              </Link>
            </p>
          )}
        </div>
        <div className="lg:col-span-7">
          <InviteForm />
        </div>
      </div>
    </section>
  );
}

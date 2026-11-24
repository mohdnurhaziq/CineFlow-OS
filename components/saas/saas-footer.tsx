/* Plain <a> on purpose: these jump to a section of the landing page, and LandingMotion's click handler (smooth scroll, focus the form) only sees links next/link has not already handled. */
/* eslint-disable @next/next/no-html-link-for-pages */
import { Aperture } from "lucide-react";

const link = "inline-flex min-h-11 items-center text-zinc-400 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300 rounded";

/** The platform footer: where to go, and how to reach us. */
export function SaasFooter({ email }: { email: string }) {
  return (
    <footer className="border-t border-zinc-800 bg-[#09090b] text-sm text-zinc-400">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-14 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <Aperture className="size-5" aria-hidden="true" />
          </span>
          <span className="font-bold tracking-tight text-white">CineFlow OS</span>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3">
          <a href="/#how" className={link}>
            How it works
          </a>
          <a href="/#pricing" className={link}>
            Pricing
          </a>
          <a href="/#faq" className={link}>
            FAQ
          </a>
          <a href={`mailto:${email}`} className={link}>
            {email}
          </a>
        </nav>

        <p className="font-mono text-xs text-zinc-400">&copy; {new Date().getFullYear()} CineFlow OS</p>
      </div>
    </footer>
  );
}

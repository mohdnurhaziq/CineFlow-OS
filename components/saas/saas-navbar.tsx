import Link from "next/link";
import { Aperture } from "lucide-react";
import { ToastAnchor } from "@/components/ui/toast-anchor";
import { PrimaryCta } from "@/components/landing/cta-buttons";
import type { LandingMode } from "@/lib/landing/mode";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

const navLink =
  "text-sm text-zinc-300 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300 rounded";

/** The platform's sticky header. Links use "/#section", so they work from every page of the platform site. */
export function SaasNavbar({ mode }: { mode: LandingMode }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/60 bg-[#09090b]/75 backdrop-blur-md">
      <ToastAnchor />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex min-h-11 items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300 rounded">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-black transition-transform group-hover:scale-105">
            <Aperture className="size-5" aria-hidden="true" />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-base font-bold tracking-tight text-white">CineFlow</span>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-amber-400">OS</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={navLink}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className={`${navLink} hidden sm:inline-flex`}>
            Sign in
          </Link>
          <div className="hidden sm:block">
            <PrimaryCta mode={mode} />
          </div>
          {/* Phones: a plain disclosure menu that needs no JavaScript. */}
          <details className="relative md:hidden">
            <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg border border-zinc-700 text-sm text-white marker:hidden focus-visible:outline-2 focus-visible:outline-amber-300 [&::-webkit-details-marker]:hidden">
              <span className="sr-only">Menu</span>
              <span aria-hidden="true" className="font-mono text-lg leading-none">
                ☰
              </span>
            </summary>
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-zinc-800 bg-[#121215] p-3 shadow-2xl">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} className="flex min-h-11 items-center rounded-lg px-3 text-zinc-200 hover:bg-zinc-800">
                  {l.label}
                </a>
              ))}
              <Link href="/login" className="flex min-h-11 items-center rounded-lg px-3 text-zinc-200 hover:bg-zinc-800">
                Sign in
              </Link>
              <div className="mt-2 border-t border-zinc-800 pt-3">
                <PrimaryCta mode={mode} />
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

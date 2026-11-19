import Link from "next/link";
import { Film, ArrowLeft } from "lucide-react";
import { platformUrl } from "@/lib/domain-name";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex items-center justify-center p-6 selection:bg-amber-500/20 selection:text-amber-400">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="size-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
          <Film className="size-8" />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-mono uppercase tracking-widest text-amber-500/80">
            Error 404
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-white">Page not found</h1>
          <p className="text-sm text-zinc-400">
            This page doesn&apos;t exist or has moved. Check the link, or go back to the start.
          </p>
        </div>

        <div className="pt-2">
          <Link
            // The platform's home, by its full address on a studio subdomain (where "/" is the studio).
            href={platformUrl("/")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-medium text-white hover:border-zinc-700 hover:bg-zinc-800 transition-all active:scale-[0.98]"
          >
            <ArrowLeft className="size-4" />
            Return to CineFlow OS
          </Link>
        </div>
      </div>
    </div>
  );
}

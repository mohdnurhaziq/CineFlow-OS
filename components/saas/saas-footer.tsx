import Link from "next/link";
import { Aperture, ShieldCheck } from "lucide-react";

export function SaasFooter() {
  return (
    <footer className="border-t border-zinc-800 bg-[#09090b] text-zinc-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="size-7 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Aperture className="size-4" />
          </div>
          <div>
            <span className="font-bold text-white tracking-tight">CineFlow OS</span>
            <span className="text-zinc-400 ml-1.5 font-mono">v2.4 Production</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <Link href="/lumina-cine" className="hover:text-white transition-colors">
            Lumina CineWorks Demo
          </Link>
          <Link href="/apex-media" className="hover:text-white transition-colors">
            Apex Photo &amp; Motion Demo
          </Link>
          <Link href="/super-admin" className="hover:text-white transition-colors">
            Super-Admin Console
          </Link>
          <Link href="/create-studio" className="hover:text-amber-400 transition-colors">
            Launch Studio
          </Link>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-400">
          <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>ALL SYSTEMS OPERATIONAL</span>
        </div>
      </div>
    </footer>
  );
}

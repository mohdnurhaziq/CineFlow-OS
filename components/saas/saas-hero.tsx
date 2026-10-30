import Link from "next/link";
import { ArrowRight, Clock, ShieldCheck, Zap, Sparkles } from "lucide-react";

export function SaasHero() {
  return (
    <section className="relative pt-20 pb-16 md:pt-28 md:pb-24 overflow-hidden">
      {/* Background radial gradient accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-amber-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 space-y-8">
        {/* Ambient status pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-400 text-xs tracking-wider uppercase font-mono shadow-sm">
          <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
          <span>CINEFLOW OS // PRODUCTION MANAGEMENT SYSTEM</span>
        </div>

        {/* Hero headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.08]">
          Run Your Creative Studio <br />
          <span className="bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 bg-clip-text text-transparent">
            Like a Feature Film Production.
          </span>
        </h1>

        {/* Editorial subtitle */}
        <p className="max-w-3xl mx-auto text-lg sm:text-xl text-zinc-400 leading-relaxed font-light">
          The all-in-one multi-tenant creative operating system unifying public showcases, 10-minute cinema slot holds, dynamic proposal signing, automated 50% milestone paywalls, and solar-timed on-set logistics.
        </p>

        {/* Dual Call to Action */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/create-studio"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-sm tracking-tight shadow-xl shadow-amber-500/25 transition-all"
          >
            <Sparkles className="size-4" />
            Create Your Studio
            <ArrowRight className="size-4" />
          </Link>

          <a
            href="#studios"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg border border-zinc-800 bg-[#121215] hover:bg-[#18181b] hover:border-zinc-700 text-zinc-200 font-semibold text-sm tracking-tight transition-all"
          >
            Explore Flagship Studios
          </a>
        </div>

        {/* Key Platform Metric Indicators */}
        <div className="pt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto text-left">
          <div className="p-4 rounded-xl border border-zinc-800/80 bg-[#121215]/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <Clock className="size-4" />
              <span className="font-mono text-xs uppercase tracking-wider">Zero Double-Bookings</span>
            </div>
            <div className="font-mono text-2xl font-bold text-white tracking-tight">10-Min Hold</div>
            <p className="text-xs text-zinc-400 mt-1">Atomic database locks with live tabular countdown timer.</p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-800/80 bg-[#121215]/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <ShieldCheck className="size-4" />
              <span className="font-mono text-xs uppercase tracking-wider">Milestone Protection</span>
            </div>
            <div className="font-mono text-2xl font-bold text-white tracking-tight">50% Paywall</div>
            <p className="text-xs text-zinc-400 mt-1">Gated master ZIP &amp; 4K video downloads until final payment.</p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-800/80 bg-[#121215]/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-cyan-400 mb-1">
              <Zap className="size-4" />
              <span className="font-mono text-xs uppercase tracking-wider">Instant Setup</span>
            </div>
            <div className="font-mono text-2xl font-bold text-white tracking-tight">&lt; 60s Launch</div>
            <p className="text-xs text-zinc-400 mt-1">Self-service studio provisioning with starter templates.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

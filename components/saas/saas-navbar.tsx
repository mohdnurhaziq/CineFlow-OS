"use client";

import Link from "next/link";
import { Aperture, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

export function SaasNavbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-[#09090b]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="size-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-black shadow-md shadow-amber-500/10 group-hover:scale-105 transition-transform">
            <Aperture className="size-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold tracking-tight text-white text-base">CineFlow</span>
              <span className="text-amber-400 font-mono font-bold text-xs tracking-wider uppercase">OS</span>
            </div>
            <span className="text-[10px] text-zinc-400 font-mono tracking-wider">CREATIVE PLATFORM</span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
          <a href="#features" className="hover:text-white transition-colors">
            Features
          </a>
          <a href="#studios" className="hover:text-white transition-colors">
            Flagship Studios
          </a>
          <a href="#demo" className="hover:text-white transition-colors">
            Interactive Demo
          </a>
          <a href="#pricing" className="hover:text-white transition-colors">
            Pricing
          </a>
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <Link
            href="/super-admin"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/60 border border-transparent hover:border-zinc-700 transition-all"
          >
            <ShieldCheck className="size-3.5 text-zinc-400" />
            Super-Admin
          </Link>

          <Link
            href="/create-studio"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-semibold text-xs sm:text-sm tracking-tight shadow-lg shadow-amber-500/20 transition-all"
          >
            <Sparkles className="size-4" />
            Create Studio
          </Link>
        </div>
      </div>
    </header>
  );
}

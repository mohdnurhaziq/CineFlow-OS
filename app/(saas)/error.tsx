"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function SaasError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("SaaS Platform Error:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6 selection:bg-amber-500/20 selection:text-amber-400">
      <div className="max-w-md w-full text-center space-y-6 p-8 rounded-2xl bg-[#121215] border border-zinc-800 shadow-xl">
        <div className="size-14 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="size-7" />
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
            CineFlow OS Notice
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-white">Temporary Disruption</h2>
          <p className="text-xs text-zinc-400">
            We encountered an unexpected issue while loading the platform. Please retry your request.
          </p>
        </div>

        {error.digest && (
          <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 text-left">
            <div className="text-[9px] font-mono uppercase text-zinc-500">Digest</div>
            <code className="text-[11px] font-mono text-zinc-300 break-all">{error.digest}</code>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 transition-colors shadow-sm active:scale-95"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <Home className="size-3.5" />
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

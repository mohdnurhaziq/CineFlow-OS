"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Critical Global Error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#09090b] text-[#fafafa] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="size-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="size-8" />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-widest text-rose-400/90">
              System Interrupt // Global Handler
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-white">Application Exception</h1>
            <p className="text-sm text-zinc-400">
              An unrecoverable exception occurred. You can reload the application state below.
            </p>
          </div>

          {error.digest && (
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-left">
              <div className="text-[10px] font-mono uppercase text-zinc-500">Incident Digest</div>
              <code className="text-xs font-mono text-zinc-300 break-all">{error.digest}</code>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={() => reset()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400 transition-colors shadow-sm shadow-amber-500/20 active:scale-95"
            >
              <RefreshCw className="size-4" />
              Reload Application
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

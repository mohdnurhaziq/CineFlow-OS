"use client";

import { buttonVariants } from "@/components/ui/button";
import { useEffect } from "react";
import { reloadIfStaleVersion } from "@/lib/stale-version";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A page left open across an update: reload it rather than show an error.
    if (reloadIfStaleVersion(error)) return;
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
              Error
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-white">Something went wrong</h1>
            <p className="text-sm text-zinc-400">
              Sorry, this page couldn&apos;t load. Please try again.
            </p>
          </div>

          {error.digest && (
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-left">
              <div className="text-[11px] font-mono uppercase text-zinc-400">Incident Digest</div>
              <code className="text-xs font-mono text-zinc-300 break-all">{error.digest}</code>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={() => reset()}
              className={buttonVariants({ size: "lg" })}
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

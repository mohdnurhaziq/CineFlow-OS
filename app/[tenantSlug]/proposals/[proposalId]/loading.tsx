import { Skeleton } from "@/components/ui/skeleton";

export default function ProposalLoading() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Proposal Document Header */}
        <div className="p-8 rounded-2xl bg-[#121215] border border-zinc-800 space-y-6">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <Skeleton className="h-6 w-32 rounded-full bg-amber-500/20" />
              <Skeleton className="h-9 w-64 bg-zinc-800" />
              <Skeleton className="h-4 w-40 bg-zinc-850" />
            </div>
            <Skeleton className="size-12 rounded-xl bg-zinc-800" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-zinc-800/80">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16 bg-zinc-850" />
                <Skeleton className="h-4 w-28 bg-zinc-800" />
              </div>
            ))}
          </div>
        </div>

        {/* Pricing & Add-on Packages */}
        <div className="p-8 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
          <Skeleton className="h-6 w-44 bg-zinc-800" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex justify-between items-center">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-40 bg-zinc-800" />
                  <Skeleton className="h-3 w-56 bg-zinc-850" />
                </div>
                <Skeleton className="h-5 w-20 bg-zinc-800" />
              </div>
            ))}
          </div>
        </div>

        {/* Contract & Canvas Signature Box Skeleton */}
        <div className="p-8 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
          <Skeleton className="h-6 w-48 bg-zinc-800" />
          <Skeleton className="h-32 w-full rounded-xl bg-zinc-900" />
          <div className="flex justify-end gap-3 pt-4">
            <Skeleton className="h-10 w-28 rounded-lg bg-zinc-800" />
            <Skeleton className="h-10 w-44 rounded-lg bg-amber-500/30" />
          </div>
        </div>
      </div>
    </div>
  );
}

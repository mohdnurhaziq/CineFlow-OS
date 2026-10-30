import { Skeleton } from "@/components/ui/skeleton";

export default function VaultLoading() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Vault Header Skeleton */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-36 rounded-full bg-zinc-800" />
            <Skeleton className="h-9 w-64 bg-zinc-800" />
            <Skeleton className="h-4 w-80 max-w-full bg-zinc-850" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-36 rounded-lg bg-zinc-800" />
            <Skeleton className="h-10 w-44 rounded-lg bg-amber-500/20" />
          </div>
        </div>

        {/* Milestone Paywall Alert Banner Skeleton */}
        <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="size-6 rounded-full bg-zinc-800" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-48 bg-zinc-800" />
              <Skeleton className="h-3 w-64 bg-zinc-850" />
            </div>
          </div>
          <Skeleton className="h-8 w-28 rounded-lg bg-zinc-800" />
        </div>

        {/* Deliverables Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl overflow-hidden bg-[#121215] border border-zinc-800 space-y-3 p-3">
              <Skeleton className="aspect-video w-full rounded-lg bg-zinc-850" />
              <div className="flex justify-between items-center px-1">
                <Skeleton className="h-4 w-32 bg-zinc-800" />
                <Skeleton className="h-4 w-16 bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

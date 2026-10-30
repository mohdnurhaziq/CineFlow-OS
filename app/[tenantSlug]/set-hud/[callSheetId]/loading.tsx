import { Skeleton } from "@/components/ui/skeleton";

export default function SetHudLoading() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* On-Set Top Status Bar */}
        <div className="p-6 rounded-2xl bg-[#121215] border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-28 rounded-full bg-amber-500/20" />
              <Skeleton className="h-5 w-32 rounded-full bg-zinc-800" />
            </div>
            <Skeleton className="h-8 w-64 bg-zinc-800" />
            <Skeleton className="h-4 w-72 bg-zinc-850" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-36 rounded-lg bg-zinc-800" />
            <Skeleton className="h-10 w-36 rounded-lg bg-emerald-500/20" />
          </div>
        </div>

        {/* Solar Ephemeris Engine 5-Pillar Banner Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2 text-center">
              <Skeleton className="h-3 w-20 mx-auto bg-zinc-800" />
              <Skeleton className="h-6 w-24 mx-auto bg-amber-500/20" />
              <Skeleton className="h-2.5 w-16 mx-auto bg-zinc-850" />
            </div>
          ))}
        </div>

        {/* Shot List Matrix Skeleton */}
        <div className="rounded-2xl bg-[#121215] border border-zinc-800 p-6 space-y-4">
          <Skeleton className="h-6 w-40 bg-zinc-800" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <Skeleton className="size-6 rounded-md bg-zinc-800" />
                  <Skeleton className="h-5 w-20 bg-zinc-800" />
                  <Skeleton className="h-4 w-48 bg-zinc-850" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full bg-zinc-800" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

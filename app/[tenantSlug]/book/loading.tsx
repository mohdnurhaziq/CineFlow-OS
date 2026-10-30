import { Skeleton } from "@/components/ui/skeleton";

export default function BookLoading() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Top Header */}
        <div className="text-center space-y-3 max-w-xl mx-auto">
          <Skeleton className="h-6 w-36 mx-auto rounded-full bg-zinc-800" />
          <Skeleton className="h-10 w-72 mx-auto bg-zinc-800" />
          <Skeleton className="h-4 w-96 mx-auto max-w-full bg-zinc-850" />
        </div>

        {/* 10-Minute Pessimistic Hold Warning Banner Skeleton */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="size-5 rounded-full bg-amber-500/30" />
            <Skeleton className="h-4 w-64 bg-amber-500/20" />
          </div>
          <Skeleton className="h-4 w-24 bg-amber-500/20" />
        </div>

        {/* Two-Column Grid: Packages on left, Calendar slots on right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-4">
            <Skeleton className="h-5 w-40 bg-zinc-800" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-5 rounded-xl bg-[#121215] border border-zinc-800 space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-32 bg-zinc-800" />
                  <Skeleton className="h-5 w-16 bg-zinc-800" />
                </div>
                <Skeleton className="h-10 w-full bg-zinc-850" />
                <div className="flex justify-between pt-2">
                  <Skeleton className="h-3 w-20 bg-zinc-800" />
                  <Skeleton className="h-3 w-20 bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-7 space-y-4">
            <Skeleton className="h-5 w-48 bg-zinc-800" />
            <div className="p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-6">
              <div className="flex justify-between items-center">
                <Skeleton className="h-6 w-36 bg-zinc-800" />
                <div className="flex gap-2">
                  <Skeleton className="size-8 rounded-lg bg-zinc-800" />
                  <Skeleton className="size-8 rounded-lg bg-zinc-800" />
                </div>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {[...Array(28)].map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg bg-zinc-850" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

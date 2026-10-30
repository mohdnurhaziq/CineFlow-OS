import { Skeleton } from "@/components/ui/skeleton";

export default function TenantShowcaseLoading() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Studio Header Nav Skeleton */}
      <header className="h-16 border-b border-zinc-800/80 bg-[#121215]/80 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg bg-amber-500/20" />
          <Skeleton className="h-5 w-32 bg-zinc-800" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-24 rounded-lg bg-zinc-800" />
          <Skeleton className="h-9 w-28 rounded-lg bg-amber-500/30" />
        </div>
      </header>

      {/* Hero Showcase Skeleton */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 text-center flex flex-col items-center space-y-4">
        <Skeleton className="h-6 w-36 rounded-full bg-zinc-800" />
        <Skeleton className="h-12 sm:h-16 w-3/4 max-w-2xl bg-zinc-800" />
        <Skeleton className="h-5 w-2/3 max-w-lg bg-zinc-850" />
        <div className="flex gap-3 pt-3">
          <Skeleton className="h-11 w-36 rounded-lg bg-amber-500/30" />
          <Skeleton className="h-11 w-32 rounded-lg bg-zinc-800" />
        </div>
      </section>

      {/* Categories Filter Pills */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-2 justify-center overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full bg-zinc-800/80" />
        ))}
      </div>

      {/* Showcase Media Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 space-y-3 p-3">
              <Skeleton className="aspect-video w-full rounded-lg bg-zinc-800" />
              <div className="space-y-2 p-1">
                <Skeleton className="h-5 w-3/4 bg-zinc-800" />
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-1/3 bg-zinc-850" />
                  <Skeleton className="h-3 w-1/4 bg-zinc-850" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

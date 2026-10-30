import { Skeleton } from "@/components/ui/skeleton";

export default function SaasLoading() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Hero Skeleton */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center space-y-6">
        <Skeleton className="h-7 w-48 rounded-full bg-zinc-800/80" />
        <Skeleton className="h-16 w-3/4 max-w-3xl bg-zinc-800/90" />
        <Skeleton className="h-6 w-2/3 max-w-2xl bg-zinc-850" />
        <div className="flex gap-4 pt-4">
          <Skeleton className="h-12 w-44 rounded-lg bg-amber-500/20" />
          <Skeleton className="h-12 w-36 rounded-lg bg-zinc-800" />
        </div>
      </section>

      {/* Studios Switcher Skeleton */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Skeleton className="h-8 w-64 mb-6 bg-zinc-800" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 rounded-2xl bg-[#121215] border border-zinc-800/80 space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-xl bg-zinc-800" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-3/4 bg-zinc-800" />
                  <Skeleton className="h-3 w-1/2 bg-zinc-800/60" />
                </div>
              </div>
              <Skeleton className="h-16 w-full rounded-lg bg-zinc-900" />
              <div className="flex justify-between pt-2">
                <Skeleton className="h-4 w-20 bg-zinc-800" />
                <Skeleton className="h-4 w-24 bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Grid Skeleton */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-3">
              <Skeleton className="size-10 rounded-lg bg-zinc-800" />
              <Skeleton className="h-5 w-40 bg-zinc-800" />
              <Skeleton className="h-12 w-full bg-zinc-850" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

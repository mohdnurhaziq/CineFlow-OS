import { Skeleton } from "@/components/ui/skeleton";

export default function VisualizerLoading() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
          <div className="space-y-1">
            <Skeleton className="h-7 w-56 bg-zinc-800" />
            <Skeleton className="h-4 w-72 bg-zinc-850" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28 rounded-lg bg-zinc-800" />
            <Skeleton className="h-9 w-32 rounded-lg bg-amber-500/20" />
          </div>
        </div>

        {/* Visualizer Canvas & Controls Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8">
            <div className="aspect-[16/10] w-full rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center p-8">
              <Skeleton className="aspect-[4/3] w-2/3 max-w-md rounded-lg bg-zinc-800/80 shadow-2xl" />
            </div>
          </div>
          <div className="lg:col-span-4 space-y-6">
            <div className="p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-5">
              <Skeleton className="h-5 w-36 bg-zinc-800" />
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-lg bg-zinc-850" />
                ))}
              </div>
              <Skeleton className="h-5 w-32 bg-zinc-800 pt-2" />
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-10 rounded-lg bg-zinc-850" />
                ))}
              </div>
              <Skeleton className="h-12 w-full rounded-xl bg-amber-500/30 mt-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

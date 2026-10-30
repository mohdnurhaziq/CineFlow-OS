import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40 bg-zinc-800" />
          <Skeleton className="h-8 w-72 bg-zinc-800" />
          <Skeleton className="h-4 w-96 max-w-full bg-zinc-850" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-lg bg-zinc-800" />
          <Skeleton className="h-9 w-28 rounded-lg bg-zinc-800" />
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 rounded-xl bg-[#121215] border border-zinc-800/80 space-y-3">
            <div className="flex justify-between items-center">
              <Skeleton className="h-3 w-24 bg-zinc-800" />
              <Skeleton className="size-8 rounded-lg bg-zinc-800" />
            </div>
            <Skeleton className="h-8 w-32 bg-zinc-800" />
            <Skeleton className="h-3 w-40 bg-zinc-850" />
          </div>
        ))}
      </div>

      {/* Middle Section: Table Skeleton & Funnel Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl bg-[#121215] border border-zinc-800 p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
            <Skeleton className="h-5 w-48 bg-zinc-800" />
            <Skeleton className="h-4 w-20 bg-zinc-800" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-zinc-850">
                <Skeleton className="h-4 w-24 bg-zinc-800" />
                <Skeleton className="h-4 w-40 bg-zinc-800" />
                <Skeleton className="h-4 w-16 bg-zinc-800" />
                <Skeleton className="h-5 w-20 rounded bg-zinc-800" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-[#121215] border border-zinc-800 p-5 space-y-4">
          <Skeleton className="h-5 w-32 bg-zinc-800" />
          <Skeleton className="h-20 w-full rounded-lg bg-zinc-900" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-16 rounded bg-zinc-900" />
            <Skeleton className="h-16 rounded bg-zinc-900" />
            <Skeleton className="h-16 rounded bg-zinc-900" />
          </div>
        </div>
      </div>
    </div>
  );
}

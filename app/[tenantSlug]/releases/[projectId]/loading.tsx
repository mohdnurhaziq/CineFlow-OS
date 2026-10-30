import { Skeleton } from "@/components/ui/skeleton";

export default function ReleaseLoading() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
        <div className="p-8 rounded-2xl bg-[#121215] border border-zinc-800 space-y-6">
          <div className="space-y-2 text-center">
            <Skeleton className="h-6 w-36 mx-auto rounded-full bg-amber-500/20" />
            <Skeleton className="h-8 w-64 mx-auto bg-zinc-800" />
            <Skeleton className="h-4 w-80 mx-auto max-w-full bg-zinc-850" />
          </div>

          <div className="space-y-4 pt-4">
            <Skeleton className="h-44 w-full rounded-xl bg-zinc-900" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Skeleton className="h-11 rounded-lg bg-zinc-850" />
              <Skeleton className="h-11 rounded-lg bg-zinc-850" />
            </div>
            <Skeleton className="h-32 w-full rounded-xl bg-zinc-900" />
            <Skeleton className="h-12 w-full rounded-xl bg-amber-500/30" />
          </div>
        </div>
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function CheckoutLoading() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <Skeleton className="h-6 w-48 bg-zinc-800" />
          <Skeleton className="h-7 w-32 rounded-full bg-amber-500/20" />
        </div>

        {/* 2-Column Checkout Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Order Summary on Left */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
              <Skeleton className="h-5 w-32 bg-zinc-800" />
              <div className="space-y-3 pt-2">
                <Skeleton className="h-4 w-full bg-zinc-850" />
                <Skeleton className="h-4 w-3/4 bg-zinc-850" />
                <Skeleton className="h-4 w-5/6 bg-zinc-850" />
              </div>
              <div className="border-t border-zinc-800 pt-4 flex justify-between">
                <Skeleton className="h-6 w-28 bg-zinc-800" />
                <Skeleton className="h-6 w-20 bg-amber-500/30" />
              </div>
            </div>
          </div>

          {/* Payment Method Selector on Right */}
          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-6">
              <Skeleton className="h-6 w-44 bg-zinc-800" />
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-16 rounded-xl bg-zinc-850" />
                <Skeleton className="h-16 rounded-xl bg-zinc-850" />
                <Skeleton className="h-16 rounded-xl bg-zinc-850" />
              </div>
              <Skeleton className="h-48 w-full rounded-xl bg-zinc-900" />
              <Skeleton className="h-12 w-full rounded-xl bg-amber-500/30" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

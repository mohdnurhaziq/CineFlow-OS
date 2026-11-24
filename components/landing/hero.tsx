import { PLANS } from "@/lib/billing/plans";
import type { LandingMode } from "@/lib/landing/mode";
import type { LandingVideo } from "@/lib/landing/media";
import { LoopVideo } from "@/components/landing/loop-video";
import { SplitHeading } from "@/components/landing/split-heading";
import { PrimaryCta, SecondaryCta } from "@/components/landing/cta-buttons";

/** The first screen: a night-time set, the promise in three words, and the one action. */
export function Hero({ mode, video }: { mode: LandingMode; video: LandingVideo }) {
  return (
    <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden pt-24 pb-14 sm:pb-20">
      <LoopVideo mp4={video.mp4} mp4Portrait={video.mp4Portrait} poster={video.poster} posterPortrait={video.posterPortrait} alt="" priority className="absolute inset-0 -z-10" />
      {/* Keeps the headline readable over any clip, and the edges deep black. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-[#09090b] via-[#09090b]/55 to-[#09090b]/20" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[#09090b]/80 via-transparent to-transparent" />
      {/* A warm key light, so the first screen has depth even before a video is added. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(55%_55%_at_78%_38%,rgba(245,158,11,0.20),transparent_70%)]" />

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-amber-400">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-red-500" />
          For photo and video studios
        </p>
        <SplitHeading as="h1" text="Booked. Paid." accent="Delivered." className="max-w-4xl text-[clamp(3.25rem,11vw,9rem)]" />
        <p data-reveal data-reveal-delay="0.5" className="mt-8 max-w-xl text-base leading-relaxed text-zinc-300 sm:text-lg">
          CineFlow OS runs your whole studio: online bookings, payments, proposals, galleries, prints and your own website, in one place.
        </p>
        <div data-reveal data-reveal-delay="0.65" className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
          <PrimaryCta mode={mode} />
          <SecondaryCta mode={mode} />
        </div>
        <p data-reveal data-reveal-delay="0.8" className="mt-8 font-mono text-xs text-zinc-400">
          14-day free trial · From RM {PLANS.STARTER.priceMyr} a month
        </p>
      </div>
    </section>
  );
}

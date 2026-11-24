import { CHAPTERS, planBadge } from "@/lib/landing/content";
import type { LandingVideo } from "@/lib/landing/media";
import { DeviceFrame } from "@/components/landing/device-frame";
import { LoopVideo } from "@/components/landing/loop-video";
import { SplitHeading } from "@/components/landing/split-heading";

type Videos = Partial<Record<"shoot" | "deliver" | "print", LandingVideo>>;

/** The print clip ends differently from how it starts (a hand nudges the frame), so its end dissolves into its start. */
const PRINT_CROSSFADE_SECONDS = 1;

/** One client's path through a studio, in six steps, each with the real screen it happens on. */
export function Journey({ videos }: { videos: Videos }) {
  return (
    <section id="how" aria-labelledby="how-h" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.25em] text-amber-400">How it works</p>
        <SplitHeading text="One client." accent="Six steps. One system." className="max-w-3xl text-[clamp(2.5rem,6.5vw,5.5rem)]" />
        <h2 id="how-h" className="sr-only">
          How it works: one client, six steps
        </h2>

        <ol className="mt-20 space-y-24 sm:space-y-36">
          {CHAPTERS.map((c, i) => {
            const badge = planBadge(c.feature);
            const clip = c.video ? videos[c.video] : undefined;
            const flip = i % 2 === 1;
            return (
              <li key={c.key} className="grid items-start gap-10 lg:grid-cols-12 lg:gap-16">
                <div className={`lg:sticky lg:top-32 lg:col-span-5 ${flip ? "lg:order-2" : ""}`}>
                  <div data-reveal className="flex items-baseline gap-4">
                    <span className="font-[family-name:var(--font-display)] text-7xl italic leading-none text-amber-400/90">{c.n}</span>
                    {badge && (
                      <span className="rounded-full border border-amber-500/40 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-amber-300">
                        {badge}
                      </span>
                    )}
                  </div>
                  <h3 data-reveal data-reveal-delay="0.1" className="mt-6 font-[family-name:var(--font-display)] text-4xl leading-tight text-white sm:text-5xl">
                    {c.title}
                  </h3>
                  <p data-reveal data-reveal-delay="0.2" className="mt-5 max-w-md text-base leading-relaxed text-zinc-400">
                    {c.body}
                  </p>
                </div>

                <div className={`lg:col-span-7 ${flip ? "lg:order-1" : ""}`}>
                  {/* Computers: the browser window with the phone beside it, never over it and never cropped.
                      Phones get only the phone screen, which is readable at that size. */}
                  <div className="sm:flex sm:items-center sm:gap-5">
                    <div className="hidden sm:block sm:min-w-0 sm:flex-1" data-parallax="24">
                      <DeviceFrame kind="browser">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.shot.desktop} alt={c.shot.alt} loading="lazy" decoding="async" className="aspect-[16/10] w-full object-cover object-top" />
                      </DeviceFrame>
                    </div>
                    {c.shot.phone && (
                      <div className="flex justify-center sm:block sm:w-[30%] sm:max-w-[220px] sm:shrink-0">
                        <DeviceFrame kind="phone" className="w-[min(72%,260px)] sm:w-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.shot.phone} alt={`${c.shot.alt}, on a phone`} loading="lazy" decoding="async" className="aspect-[9/19] w-full object-cover object-top" />
                        </DeviceFrame>
                      </div>
                    )}
                  </div>
                  {clip?.mp4 && <LoopVideo mp4={clip.mp4} poster={clip.poster} alt="" className="relative mt-8 aspect-video w-full rounded-xl border border-zinc-800" crossfade={c.video === "print" ? PRINT_CROSSFADE_SECONDS : 0} />}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

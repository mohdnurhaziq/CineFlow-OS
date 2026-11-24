import { PLANS, cheapestPlanWith } from "@/lib/billing/plans";
import { DeviceFrame } from "@/components/landing/device-frame";
import { SplitHeading } from "@/components/landing/split-heading";

/** The studio's own public website, which comes with every plan. */
export function OwnWebsite() {
  return (
    <section aria-labelledby="site-h" className="relative border-y border-zinc-800/80 bg-[#0c0c0f] py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
        <div className="lg:col-span-5">
          <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.25em] text-amber-400">Your own website</p>
          <SplitHeading text="A website for your studio," accent="already built." className="text-[clamp(2.25rem,5vw,4.25rem)]" />
          <h2 id="site-h" className="sr-only">
            Your studio&apos;s own website
          </h2>
          <p data-reveal className="mt-6 max-w-md text-base leading-relaxed text-zinc-400">
            Your portfolio, your services and prices, and your booking page, all under your studio&apos;s name and colours. Clients find you, pick a
            package and book, without you building a thing.
          </p>
          <p data-reveal data-reveal-delay="0.1" className="mt-4 max-w-md text-sm leading-relaxed text-zinc-400">
            On the {PLANS[cheapestPlanWith("customDomain")].name} plan and above, it lives on your own web address.
          </p>
        </div>
        <div className="lg:col-span-7" data-parallax="20">
          <DeviceFrame kind="browser" url="yourstudio.com">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/shots/website-desktop.webp"
              alt="A studio's public website with its portfolio and packages"
              loading="lazy"
              decoding="async"
              className="aspect-[16/10] w-full object-cover object-top"
            />
          </DeviceFrame>
        </div>
      </div>
    </section>
  );
}

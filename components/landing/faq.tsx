import { faqItems } from "@/lib/landing/content";
import type { LandingMode } from "@/lib/landing/mode";
import { SplitHeading } from "@/components/landing/split-heading";

export function Faq({ mode, email, googleOn = false }: { mode: LandingMode; email: string; googleOn?: boolean }) {
  return (
    <section id="faq" aria-labelledby="faq-h" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-4">
          <SplitHeading text="Questions," accent="answered." className="text-[clamp(2.25rem,5vw,4rem)]" />
          <h2 id="faq-h" className="sr-only">
            Frequently asked questions
          </h2>
        </div>
        <div className="divide-y divide-zinc-800 border-y border-zinc-800 lg:col-span-8">
          {faqItems(mode, email, googleOn).map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 text-lg text-white marker:hidden focus-visible:outline-2 focus-visible:outline-amber-300 [&::-webkit-details-marker]:hidden">
                {item.q}
                <span aria-hidden="true" className="text-2xl leading-none text-amber-400 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl leading-relaxed text-zinc-400">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

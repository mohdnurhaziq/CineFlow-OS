import type { ReactNode } from "react";
import { FEATURE_LABEL, PLANS, PLAN_CODES, type PlanFeature } from "@/lib/billing/plans";
import { TRIAL_DAYS } from "@/lib/billing/state";
import type { LandingMode } from "@/lib/landing/mode";
import { PrimaryCta } from "@/components/landing/cta-buttons";
import { SplitHeading } from "@/components/landing/split-heading";

const BASE = ["Online booking with held slots", "Invoices, DuitNow and bank-slip payments", "Client portal and galleries", "Your studio's own website"];

const teamLine = (limit: number) => (limit === 0 ? "Owner only" : limit === Infinity ? "Unlimited team members" : `Up to ${limit} team members`);

/** The plans, straight from the catalogue the app itself uses. */
export function Pricing({ mode }: { mode: LandingMode }) {
  return (
    <section id="pricing" aria-labelledby="pricing-h" className="relative scroll-mt-20 border-t border-zinc-800/80 bg-[#0c0c0f] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.25em] text-amber-400">Pricing</p>
        <SplitHeading text="Pick a plan." accent={`Try it free for ${TRIAL_DAYS} days.`} className="max-w-3xl text-[clamp(2.5rem,6vw,5rem)]" />
        <h2 id="pricing-h" className="sr-only">
          Pricing
        </h2>

        <div className="mt-16 grid gap-5 lg:grid-cols-3">
          {PLAN_CODES.map((code, i) => {
            const plan = PLANS[code];
            const previous = i === 0 ? null : PLANS[PLAN_CODES[i - 1]!];
            const before = previous?.features ?? [];
            const adds = plan.features.filter((f: PlanFeature) => !before.includes(f)).map((f: PlanFeature) => FEATURE_LABEL[f]);
            return (
              <article key={code} data-reveal data-reveal-delay={String(i * 0.12)} className="flex flex-col rounded-2xl border border-zinc-800 bg-[#121215] p-7">
                <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">{plan.name}</h3>
                <p className="mt-5 flex items-baseline gap-2">
                  <span className="font-[family-name:var(--font-display)] text-6xl leading-none text-white">RM {plan.priceMyr}</span>
                  <span className="text-sm text-zinc-400">a month</span>
                </p>
                <p className="mt-3 font-mono text-xs uppercase tracking-wider text-amber-300">{teamLine(plan.teamLimit)}</p>
                <ul className="mt-6 space-y-3 border-t border-zinc-800 pt-6 text-sm text-zinc-300">
                  {previous ? <li className="text-zinc-400">Everything in {previous.name}, plus:</li> : BASE.map((b) => <Item key={b}>{b}</Item>)}
                  {adds.map((a) => (
                    <Item key={a}>{a}</Item>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <ul className="mt-12 grid gap-3 text-sm text-zinc-400 sm:grid-cols-3">
          <li>Every new studio starts with a {TRIAL_DAYS}-day free trial with everything unlocked.</li>
          <li>Pay by bank transfer or DuitNow. No card needed.</li>
          <li>Change plan any time. Moving down deletes nothing.</li>
        </ul>
        <div className="mt-10">
          <PrimaryCta mode={mode} />
        </div>
      </div>
    </section>
  );
}

function Item({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-400" />
      <span>{children}</span>
    </li>
  );
}

import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

const TIERS = [
  {
    id: "STARTER",
    name: "Starter",
    priceUsd: "$29",
    priceMyr: "RM 99",
    seats: "1 Studio Lead",
    description: "Ideal for solo portrait photographers and independent creators launching their branded digital studio.",
    features: [
      "Custom branded public showcase",
      "Cinema-style 10-min slot hold",
      "Card, QR code & cash checkout",
      "50% milestone paywall vault",
      "Standard client deliverable storage",
      "Basic gear inventory tracking",
    ],
    cta: "Launch Starter Studio",
    highlight: false,
  },
  {
    id: "PRO",
    name: "Pro Studio",
    priceUsd: "$79",
    priceMyr: "RM 249",
    seats: "Up to 5 Crew Members",
    description: "Built for boutique commercial, wedding, and event production houses needing collaborative tools.",
    features: [
      "Everything in Starter, plus:",
      "Custom domain mapping (studio.yourname.com)",
      "Interactive proposals with live add-ons",
      "Digital contract signature pad",
      "On-set solar Golden Hour HUD",
      "1-Click WhatsApp call sheet dispatch",
      "Equipment kit bundles (BOM)",
      "Dedicated QR receipt verification console",
    ],
    cta: "Launch Pro Studio",
    highlight: true,
  },
  {
    id: "STUDIO_UNLIMITED",
    name: "Studio Unlimited",
    priceUsd: "$199",
    priceMyr: "RM 599",
    seats: "Unlimited Crew & Admins",
    description: "The complete studio operating system for full-scale creative agencies and multi-team production houses.",
    features: [
      "Everything in Pro, plus:",
      "Interactive 84-inch living room wall visualizer",
      "Custom frame moldings & print order invoicing",
      "Pre/post-shoot inspection damage logs",
      "Multi-camera serialized gear registry",
      "Multi-crew call sheet assignments",
      "Platform API & webhook access",
      "24/7 dedicated production support",
    ],
    cta: "Launch Unlimited Studio",
    highlight: false,
  },
];

export function PricingTiers() {
  return (
    <section id="pricing" className="py-20 bg-[#09090b]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/20 bg-amber-500/10 text-xs font-mono text-amber-400">
            <span>TRANSPARENT SUBSCRIPTION TIERS</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Pricing Sized for Every Creative Ambition
          </h2>
          <p className="text-zinc-400 text-base">
            All plans include full database persistence, local asset uploads, and zero per-booking commission fees.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`p-8 rounded-2xl border flex flex-col justify-between transition-all relative ${
                tier.highlight
                  ? "bg-[#15151a] border-amber-500/50 shadow-2xl shadow-amber-500/10 ring-1 ring-amber-500/30"
                  : "bg-[#121215] border-zinc-800 hover:border-zinc-700"
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-amber-500 text-black text-xs font-bold tracking-tight shadow-md">
                  <Sparkles className="size-3" />
                  MOST POPULAR
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">{tier.name}</h3>
                  <p className="text-xs text-zinc-400 mt-2">{tier.description}</p>
                </div>

                <div className="pt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-4xl sm:text-5xl font-black text-white tabular-nums">
                      {tier.priceUsd}
                    </span>
                    <span className="text-zinc-400 text-sm">/ month</span>
                  </div>
                  <div className="text-xs font-mono text-zinc-400 mt-1">
                    or {tier.priceMyr} / month • {tier.seats}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-zinc-800">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">Features Included:</span>
                  <ul className="space-y-2.5">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs text-zinc-300">
                        <Check className="size-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-8">
                <Link
                  href={`/create-studio?tier=${tier.id}`}
                  className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold tracking-tight transition-all active:scale-[0.98] ${
                    tier.highlight
                      ? "bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20"
                      : "bg-zinc-800 hover:bg-zinc-700 text-white"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

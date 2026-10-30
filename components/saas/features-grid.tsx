import {
  Clock,
  CreditCard,
  FileText,
  Lock,
  Smartphone,
  Maximize2,
  Box,
  Sliders,
} from "lucide-react";

const PILLARS = [
  {
    icon: Clock,
    title: "Cinema-Style Slot Holding",
    badge: "0% Double Bookings",
    description:
      "Atomic conditional database updates lock calendar slots for exactly 10 minutes with live countdown timers, preventing double bookings during peak graduation and festive seasons.",
  },
  {
    icon: CreditCard,
    title: "Multi-Mode Checkout & Verification",
    badge: "Card, QR, Cash",
    description:
      "Flexible payment engine supporting instant online card simulation, studio QR code scan with receipt proof uploads, and counter cash payments with studio verification queue.",
  },
  {
    icon: FileText,
    title: "Interactive Proposals & Add-Ons",
    badge: "Real-Time Subtotals",
    description:
      "Clients toggle line-item add-ons with dynamic subtotal recalculation, automated 50% retainer invoicing, dynamic contract clauses, and 60fps digital signature capture.",
  },
  {
    icon: Lock,
    title: "50% Milestone Paywall Vault",
    badge: "Automated Paywall",
    description:
      "Dual-tier asset delivery vault enforcing final balance settlement before unlocking uncompressed high-resolution photo ZIPs and 4K master ProRes video downloads.",
  },
  {
    icon: Smartphone,
    title: "On-Set Mobile Companion & HUD",
    badge: "Solar & WhatsApp",
    description:
      "Dynamic call sheets featuring algorithmic solar Golden Hour calculations, 1-click WhatsApp dispatch links, visual shot list check-offs, and digital talent release signing.",
  },
  {
    icon: Maximize2,
    title: "Print & Frame Wall Visualizer",
    badge: "Living Room Scale",
    description:
      "Interactive 84-inch sofa mockup scaling client photographs to 8R, 12R, and 16R dimensions with customizable frame moldings (Matte Black, Walnut, Gold) and 1-click print orders.",
  },
  {
    icon: Box,
    title: "Gear Inventory & Kit BOM",
    badge: "Equipment Tracking",
    description:
      "Serialized equipment registry with condition grades, modular kit bundle recipes (Bill of Materials), and pre/post-shoot inspection condition logs with damage tracking.",
  },
  {
    icon: Sliders,
    title: "100% Dynamic Studio Admin CRUD",
    badge: "Zero Hardcoded Logic",
    description:
      "Comprehensive studio admin control across packages, campaign categories, calendar slots, frame designs, print sizes, add-ons, and studio bank credentials.",
  },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="py-20 bg-[#09090b]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/20 bg-amber-500/10 text-xs font-mono text-amber-400">
            <span>THE 8 PILLARS OF CINEFLOW OS</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Engineered for High-End Creative Operations
          </h2>
          <p className="text-zinc-400 text-base">
            Every feature is purposefully built around the realities of boutique photo and cinema production — from client discovery to on-set execution.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PILLARS.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-xl border border-zinc-800 bg-[#121215] hover:border-zinc-700 hover:bg-[#151518] transition-all flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="size-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 group-hover:scale-110 group-hover:bg-amber-500/10 transition-all">
                      <Icon className="size-5" />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                      {pillar.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-white group-hover:text-amber-400 transition-colors">
                      {pillar.title}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{pillar.description}</p>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-zinc-800/60 text-[10px] font-mono text-zinc-400">
                  PILLAR 0{idx + 1} // PRODUCTION
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

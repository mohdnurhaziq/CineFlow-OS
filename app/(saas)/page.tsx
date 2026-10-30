import { SaasHero } from "@/components/saas/saas-hero";
import { StudioSwitcher } from "@/components/saas/studio-switcher";
import { FeaturesGrid } from "@/components/saas/features-grid";
import { InteractiveTeasers } from "@/components/saas/interactive-teasers";
import { PricingTiers } from "@/components/saas/pricing-tiers";

export const metadata = {
  title: "CineFlow OS — The Multi-Tenant Creative Operating System",
  description:
    "The all-in-one platform unifying public showcases, 10-minute cinema slot holds, dynamic proposal signing, automated 50% milestone paywalls, and solar-timed on-set logistics.",
};

export default function SaasLandingPage() {
  return (
    <main>
      <SaasHero />
      <StudioSwitcher />
      <FeaturesGrid />
      <InteractiveTeasers />
      <PricingTiers />
    </main>
  );
}

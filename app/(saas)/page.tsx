import { SaasHero } from "@/components/saas/saas-hero";
import { StudioSwitcher } from "@/components/saas/studio-switcher";
import { FeaturesGrid } from "@/components/saas/features-grid";
import { InteractiveTeasers } from "@/components/saas/interactive-teasers";
import { PricingTiers } from "@/components/saas/pricing-tiers";
import { showsDemoStudios } from "@/lib/demo-studios";

export const metadata = {
  title: { absolute: "CineFlow OS — The Multi-Tenant Creative Operating System" },
  description:
    "The all-in-one platform unifying public showcases, clash-free online booking, dynamic proposal signing, automated 50% milestone paywalls, and solar-timed on-set logistics.",
};

export default function SaasLandingPage() {
  // The demo studios exist only in dev and staging (lib/demo-studios).
  const demo = showsDemoStudios();
  return (
    <main>
      <SaasHero showDemoStudios={demo} />
      {demo && <StudioSwitcher />}
      <FeaturesGrid />
      <InteractiveTeasers />
      <PricingTiers />
    </main>
  );
}

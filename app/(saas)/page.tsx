import type { Metadata } from "next";
import { studioSignupStatus } from "@/lib/actions/onboarding";
import { landingMode } from "@/lib/landing/mode";
import { publicContactEmail } from "@/lib/landing/contact";
import { landingVideo } from "@/lib/landing/media";
import { LandingMotion } from "@/components/landing/landing-motion";
import { Hero } from "@/components/landing/hero";
import { Journey } from "@/components/landing/journey";
import { OwnWebsite } from "@/components/landing/own-website";
import { Extras } from "@/components/landing/extras";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { InviteSection } from "@/components/landing/invite-section";

// Sign-up status can change without a rebuild, so this page is built on each request.
export const dynamic = "force-dynamic";

const TITLE = "CineFlow OS: run your photo and video studio in one place";
const DESCRIPTION =
  "Online booking, payments, proposals, galleries, prints and your own website for photo and video studios. Try it free for 14 days.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, images: [{ url: "/landing/og.jpg", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/landing/og.jpg"] },
};

export default async function SaasLandingPage() {
  const mode = landingMode(await studioSignupStatus());
  return (
    <LandingMotion>
      <main>
        <Hero mode={mode} video={landingVideo("hero")} />
        <Journey videos={{ shoot: landingVideo("shoot"), deliver: landingVideo("deliver"), print: landingVideo("print") }} />
        <OwnWebsite />
        <Extras />
        <Pricing mode={mode} />
        <Faq mode={mode} email={publicContactEmail()} />
        <InviteSection mode={mode} />
      </main>
    </LandingMotion>
  );
}

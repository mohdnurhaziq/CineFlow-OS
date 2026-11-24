import { Instrument_Serif } from "next/font/google";
import { SaasNavbar } from "@/components/saas/saas-navbar";
import { SaasFooter } from "@/components/saas/saas-footer";
import { studioSignupStatus } from "@/lib/actions/onboarding";
import { landingMode } from "@/lib/landing/mode";
import { publicContactEmail } from "@/lib/landing/contact";
import { appUrl } from "@/lib/domain-name";

// The display face for the platform pages' big headlines; Geist stays for everything else.
const display = Instrument_Serif({ variable: "--font-display", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

// Without this, share previews (WhatsApp, Facebook, X) would point at localhost for the image.
export const metadata = { metadataBase: appUrl() };

export default async function SaasLayout({ children }: { children: React.ReactNode }) {
  // The header's main button follows how sign-up works right now (read on each request).
  const mode = landingMode(await studioSignupStatus());
  return (
    <div className={`${display.variable} flex min-h-screen flex-col bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-amber-500 focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
      >
        Skip to main content
      </a>
      <SaasNavbar mode={mode} />
      <div id="main-content" tabIndex={-1} className="flex-1 scroll-mt-20 outline-none">
        {children}
      </div>
      <SaasFooter email={publicContactEmail()} />
    </div>
  );
}

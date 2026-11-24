import { Instrument_Serif } from "next/font/google";
import { SaasNavbar } from "@/components/saas/saas-navbar";
import { SaasFooter } from "@/components/saas/saas-footer";
import { showsDemoStudios } from "@/lib/demo-studios";

// The display face for the landing page's big headlines; Geist stays for everything else.
const display = Instrument_Serif({ variable: "--font-display", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export default function SaasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Production links neither to the demo studios nor to the super-admin console.
  const showDemo = showsDemoStudios();
  return (
    <div className={`${display.variable} min-h-screen flex flex-col bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400`}>
      <SaasNavbar showDemo={showDemo} />
      <div className="flex-1">{children}</div>
      <SaasFooter showDemo={showDemo} />
    </div>
  );
}

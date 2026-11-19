import { SaasNavbar } from "@/components/saas/saas-navbar";
import { SaasFooter } from "@/components/saas/saas-footer";
import { showsDemoStudios } from "@/lib/demo-studios";

export default function SaasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Production links neither to the demo studios nor to the super-admin console.
  const showDemo = showsDemoStudios();
  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <SaasNavbar showDemo={showDemo} />
      <div className="flex-1">{children}</div>
      <SaasFooter showDemo={showDemo} />
    </div>
  );
}

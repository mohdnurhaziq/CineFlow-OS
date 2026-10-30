import { SaasNavbar } from "@/components/saas/saas-navbar";
import { SaasFooter } from "@/components/saas/saas-footer";

export default function SaasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <SaasNavbar />
      <div className="flex-1">{children}</div>
      <SaasFooter />
    </div>
  );
}

import Link from "next/link";
import { MessageSquare, ShieldCheck, CreditCard, QrCode } from "lucide-react";

interface ShowcaseFooterProps {
  tenant: {
    name: string;
    slug: string;
    discipline: string;
    currency: string;
    brandColor?: string | null;
  };
  studioLead?: {
    name: string;
    phone?: string | null;
    email: string;
  } | null;
}

export function ShowcaseFooter({ tenant, studioLead }: ShowcaseFooterProps) {
  const whatsappNumber = studioLead?.phone ? studioLead.phone.replace(/[^0-9]/g, "") : "60123456789";
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    `Hello ${tenant.name}! I have a question regarding bookings and studio rates.`
  )}`;

  return (
    <footer className="border-t border-zinc-800 bg-[#09090b] text-zinc-400 text-xs py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-8 border-b border-zinc-800/80">
          <div className="space-y-1">
            <h4 className="text-base font-bold text-white tracking-tight">{tenant.name}</h4>
            <p className="text-xs text-zinc-400">
              Creative {tenant.discipline} Studio • All bookings governed by 50% milestone paywall.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-[#121215] text-white text-xs font-semibold hover:border-zinc-700"
            >
              <MessageSquare className="size-3.5 text-emerald-400" />
              Direct WhatsApp Dispatch
            </a>

            <Link
              href={`/${tenant.slug}/book`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400"
            >
              Calendar Booking
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[11px] font-mono text-zinc-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <CreditCard className="size-3 text-zinc-500" /> Card &amp; Online Checkout
            </span>
            <span className="flex items-center gap-1">
              <QrCode className="size-3 text-zinc-500" /> Studio QR Scan &amp; Receipt Upload
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3 text-zinc-500" /> 100% Gated Deliverable Vault
            </span>
          </div>

          <div>
            Powered by <Link href="/" className="text-white hover:text-amber-400">CineFlow OS</Link> Multi-Tenant System
          </div>
        </div>
      </div>
    </footer>
  );
}

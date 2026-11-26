import Link from "next/link";
import { MessageSquare, ShieldCheck, CreditCard, QrCode } from "lucide-react";
import { disciplineLabel } from "@/lib/labels";
import { platformUrl, studioPath } from "@/lib/domain-name";
import type { PaymentWays } from "@/lib/payments/offered";

interface ShowcaseFooterProps {
  tenant: {
    name: string;
    slug: string;
    discipline: string;
    currency: string;
    brandColor?: string | null;
  };
  /** The payment ways the studio has set up; the footer names no others. */
  payments: PaymentWays;
  studioLead?: {
    name: string;
    phone?: string | null;
    email: string;
  } | null;
}

export function ShowcaseFooter({ tenant, studioLead, payments }: ShowcaseFooterProps) {
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
              {disciplineLabel(tenant.discipline)} studio • Every booking is secured with a deposit.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-11 sm:min-h-0 rounded-lg border border-zinc-800 bg-[#121215] text-white text-xs font-semibold hover:border-zinc-700"
            >
              <MessageSquare className="size-3.5 text-emerald-400" />
              WhatsApp the studio
            </a>

            <Link
              href={studioPath(tenant.slug, "/book")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-11 sm:min-h-0 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400"
            >
              Book a session
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[11px] font-mono text-zinc-400">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {payments.online && (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <CreditCard className="size-3 text-zinc-400" /> Pay online
              </span>
            )}
            {(payments.qr || payments.bank) && (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <QrCode className="size-3 text-zinc-400" /> {payments.qr ? "Pay by QR transfer" : "Pay by bank transfer"}
              </span>
            )}
            <span className="flex items-center gap-1 whitespace-nowrap">
              <ShieldCheck className="size-3 text-zinc-400" /> Your private online gallery
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href={studioPath(tenant.slug, "/account")}
              className="inline-flex items-center min-h-11 sm:min-h-0 text-zinc-300 hover:text-amber-400 transition-colors"
            >
              Client Login
            </Link>
            <Link
              href={studioPath(tenant.slug, "/my-booking")}
              className="inline-flex items-center min-h-11 sm:min-h-0 text-zinc-300 hover:text-amber-400 transition-colors"
            >
              Find my booking
            </Link>
            <Link
              href={studioPath(tenant.slug, "/login")}
              className="inline-flex items-center min-h-11 sm:min-h-0 text-zinc-300 hover:text-amber-400 transition-colors"
            >
              Studio Login
            </Link>
            <span>
              Powered by <Link href={platformUrl("/")} className="text-white hover:text-amber-400">CineFlow OS</Link>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

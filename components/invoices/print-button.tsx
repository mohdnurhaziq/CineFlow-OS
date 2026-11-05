"use client";

import { useState } from "react";
import { Printer, Copy, Check, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceDocument } from "@/lib/invoices/document";

interface PrintButtonProps {
  doc?: InvoiceDocument;
}

/** Opens the browser's print dialog, where the invoice can also be saved as a PDF. */
export function PrintButton({ doc }: PrintButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success("Document link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  const handleShareWhatsApp = () => {
    if (!doc) {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(window.location.href)}`, "_blank");
      return;
    }

    const isPaid = doc.status === "PAID";
    const money = `${doc.currency} ${doc.amount.toFixed(2)}`;
    const docUrl = window.location.href;

    const text = isPaid
      ? `*${doc.studio.name} — Official Payment Receipt*\n\nHi ${doc.client.name}, here is your official receipt for Invoice *#${doc.invoiceNumber}* (${money} - PAID & VERIFIED).\n\n📄 View receipt:\n${docUrl}`
      : `*${doc.studio.name} — Milestone Invoice*\n\nHi ${doc.client.name}, here is your milestone invoice *#${doc.invoiceNumber}* for *${money}*.\n\n💳 View & pay:\n${docUrl}`;

    const cleanPhone = doc.client.phone ? doc.client.phone.replace(/[^0-9]/g, "") : "";
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

    window.open(url, "_blank");
  };

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 transition-colors shadow-sm"
        title="Print document or save to PDF"
      >
        <Printer className="size-3.5" />
        Print / Save as PDF
      </button>

      <button
        type="button"
        onClick={handleShareWhatsApp}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors shadow-sm"
        title="Share official document via WhatsApp"
      >
        <MessageSquare className="size-3.5" />
        WhatsApp
      </button>

      <button
        type="button"
        onClick={handleCopyLink}
        className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
        title="Copy document link"
      >
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

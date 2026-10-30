"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, CreditCard, ArrowRight, FileText, Calendar, Lock } from "lucide-react";
import confetti from "canvas-confetti";

interface SignedAcceptanceViewProps {
  tenantSlug: string;
  proposalNumber: string;
  title: string;
  signerName: string;
  signedAt?: Date | string | null;
  clientSignature?: string | null;
  depositAmount: number;
  totalPrice: number;
  currency: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  projectId?: string | null;
  projectNumber?: string | null;
  isInitialSigning?: boolean;
}

export function SignedAcceptanceView({
  tenantSlug,
  proposalNumber,
  title,
  signerName,
  signedAt,
  clientSignature,
  depositAmount,
  totalPrice,
  currency,
  invoiceId,
  invoiceNumber,
  projectId,
  projectNumber,
  isInitialSigning = false,
}: SignedAcceptanceViewProps) {
  const currencySymbol = currency === "MYR" ? "RM " : "$";

  useEffect(() => {
    if (isInitialSigning) {
      try {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#f59e0b", "#10b981", "#ffffff"],
        });
      } catch {
        // Fallback
      }
    }
  }, [isInitialSigning]);

  const signedDateStr = signedAt
    ? new Date(signedAt).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Recently Signed";

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-[#121215] overflow-hidden shadow-2xl space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="p-8 text-center space-y-3 bg-gradient-to-b from-emerald-950/20 to-transparent border-b border-emerald-500/20">
        <div className="size-16 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
          <CheckCircle2 className="size-8" />
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
            CONTRACT LEGALLY EXECUTED
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Proposal Formally Accepted
          </h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Contract terms, addenda, and production milestones have been signed and locked into the studio database.
          </p>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Execution Metadata Card */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 font-mono text-xs space-y-3">
          <div className="flex justify-between items-center pb-2.5 border-b border-zinc-800">
            <span className="text-zinc-400">Proposal Ref:</span>
            <span className="font-bold text-amber-400 tracking-wider">#{proposalNumber}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Authorized Signer:</span>
            <span className="text-white font-semibold font-sans">{signerName}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Execution Timestamp:</span>
            <span className="text-zinc-300">{signedDateStr}</span>
          </div>

          {projectNumber && (
            <div className="flex justify-between items-center pt-2.5 border-t border-zinc-800">
              <span className="text-zinc-400">Linked Production Project:</span>
              <span className="font-bold text-white tracking-wider">#{projectNumber}</span>
            </div>
          )}

          {invoiceNumber && (
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Retainer Invoice Ref:</span>
              <span className="font-bold text-amber-400 tracking-wider">{invoiceNumber}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2.5 border-t border-zinc-800 text-sm">
            <span className="text-zinc-300 font-sans font-bold">50% Retainer Milestone Due:</span>
            <span className="font-bold text-amber-400 tabular-nums">
              {currencySymbol}
              {depositAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Digital Signature Preview */}
        {clientSignature && (
          <div className="p-4 rounded-xl border border-zinc-800 bg-black/50 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Cryptographic Digital Signature On File
            </div>
            <div className="h-24 flex items-center justify-center p-2 rounded-lg bg-zinc-900/40 border border-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={clientSignature}
                alt="Digital Signature"
                className="max-h-full max-w-full object-contain filter invert opacity-90"
              />
            </div>
          </div>
        )}

        {/* CTA to Checkout */}
        {invoiceId && (
          <div className="pt-2 space-y-2">
            <Link
              href={`/${tenantSlug}/checkout?invoiceId=${invoiceId}`}
              className="w-full py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
            >
              <CreditCard className="size-4" />
              Proceed to Retainer Checkout ({currencySymbol}
              {depositAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })})
            </Link>

            <p className="text-[10px] font-mono text-zinc-500 text-center">
              Settle via Online Card, Studio QR Transfer, or Counter Cash.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

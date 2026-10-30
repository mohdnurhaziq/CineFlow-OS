"use client";

import { useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, ExternalLink, Calendar, User, Hash } from "lucide-react";

interface ReceiptLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptUrl: string;
  invoiceNumber?: string;
  clientName?: string;
  amount?: number;
  currency?: string;
  paymentReference?: string | null;
  submittedAt?: Date | string;
}

export function ReceiptLightboxModal({
  isOpen,
  onClose,
  receiptUrl,
  invoiceNumber,
  clientName,
  amount,
  currency = "USD",
  paymentReference,
  submittedAt,
}: ReceiptLightboxModalProps) {
  const [scale, setScale] = useState(1);

  if (!isOpen) return null;

  const currencySymbol = currency === "MYR" ? "RM " : "$";

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 2.5));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.75));
  const handleReset = () => setScale(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/95 backdrop-blur-md animate-fadeIn">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 max-w-4xl w-full max-h-[90vh] bg-[#121215] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#15151a]">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              PAYMENT PROOF AUDIT
            </span>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Receipt Slip Inspection — {invoiceNumber || "Invoice"}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 mr-2">
              <button
                type="button"
                onClick={handleZoomOut}
                className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800"
                title="Zoom Out"
              >
                <ZoomOut className="size-4" />
              </button>
              <span className="text-[11px] font-mono text-zinc-400 px-2">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800"
                title="Zoom In"
              >
                <ZoomIn className="size-4" />
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800"
                title="Reset Zoom"
              >
                <RotateCcw className="size-3.5" />
              </button>
            </div>

            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="Open raw image"
            >
              <ExternalLink className="size-4" />
            </a>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="Close modal"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Content Body: Image on left, details on right */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-3">
          {/* Image Canvas */}
          <div className="md:col-span-2 overflow-auto bg-[#0a0a0d] p-6 flex items-center justify-center min-h-[350px]">
            <div
              style={{ transform: `scale(${scale})`, transition: "transform 0.15s ease-out" }}
              className="origin-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptUrl}
                alt="Uploaded Payment Receipt"
                className="max-h-[65vh] w-auto object-contain rounded-lg shadow-xl border border-zinc-800"
              />
            </div>
          </div>

          {/* Metadata Sidebar */}
          <div className="p-6 border-t md:border-t-0 md:border-l border-zinc-800 bg-[#141418] space-y-5 text-xs">
            <div>
              <h4 className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-3">
                Transaction Details
              </h4>
              <div className="space-y-3 font-mono">
                {amount !== undefined && (
                  <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                    <div className="text-[10px] text-zinc-400 uppercase">Amount Due</div>
                    <div className="text-xl font-bold text-amber-400 tabular-nums">
                      {currencySymbol}
                      {amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                )}

                {clientName && (
                  <div className="flex items-center gap-2 text-zinc-300">
                    <User className="size-4 text-zinc-500 shrink-0" />
                    <div>
                      <span className="text-[10px] text-zinc-400 block">Client</span>
                      <span className="font-sans font-medium text-white">{clientName}</span>
                    </div>
                  </div>
                )}

                {paymentReference && (
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Hash className="size-4 text-zinc-500 shrink-0" />
                    <div>
                      <span className="text-[10px] text-zinc-400 block">Payment Reference</span>
                      <span className="text-white font-bold">{paymentReference}</span>
                    </div>
                  </div>
                )}

                {submittedAt && (
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Calendar className="size-4 text-zinc-500 shrink-0" />
                    <div>
                      <span className="text-[10px] text-zinc-400 block">Submitted</span>
                      <span className="text-zinc-300">
                        {new Date(submittedAt).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800/80 text-[11px] text-zinc-400 space-y-2">
              <p className="font-sans leading-relaxed">
                Check that the beneficiary account, transaction reference, amount, and timestamp match your studio bank statement.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

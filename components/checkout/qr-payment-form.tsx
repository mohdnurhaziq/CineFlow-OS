"use client";

import { useState } from "react";
import { QrCode, Copy, Check, Upload, Image as ImageIcon, X, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface QrPaymentFormProps {
  amount: number;
  currency: string;
  qrCodeUrl?: string | null;
  bankDetails?: string | null;
  isSubmitting: boolean;
  onSubmit: (data: {
    paymentProofUrl: string;
    paymentReference: string;
  }) => void;
}

export function QrPaymentForm({
  amount,
  currency,
  qrCodeUrl,
  bankDetails,
  isSubmitting,
  onSubmit,
}: QrPaymentFormProps) {
  const currencySymbol = currency === "MYR" ? "RM " : "$";

  const [copied, setCopied] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleCopyBank = () => {
    if (!bankDetails) return;
    navigator.clipboard.writeText(bankDetails);
    setCopied(true);
    toast.success("Bank details copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setUploadError("Please upload a valid image (PNG, JPG, WebP) or PDF slip.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "receipts");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success && data.url) {
        setProofUrl(data.url);
        toast.success("Receipt slip uploaded successfully!");
      } else {
        throw new Error(data.error || "Failed to upload receipt.");
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      setUploadError(err.message || "Failed to upload receipt slip.");
      toast.error(err.message || "Failed to upload receipt.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofUrl) {
      toast.error("Please upload your bank transfer receipt slip.");
      return;
    }
    onSubmit({
      paymentProofUrl: proofUrl,
      paymentReference: paymentReference.trim() || "QR_SLIP_SUBMITTED",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 2-Column: QR Code display & Bank Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* QR Code Container */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-[#16161b] flex flex-col items-center justify-center text-center space-y-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
            Scan with Banking / eWallet App
          </div>

          <div className="p-3 bg-white rounded-xl shadow-lg border border-zinc-200">
            {qrCodeUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrCodeUrl}
                alt="Studio Payment QR Code"
                className="size-36 object-contain"
              />
            ) : (
              <div className="size-36 flex flex-col items-center justify-center text-zinc-400">
                <QrCode className="size-16 text-zinc-900" />
                <span className="text-[10px] text-zinc-500 font-mono mt-1">DuitNow / PayNow</span>
              </div>
            )}
          </div>

          <div className="text-xs font-mono font-bold text-white tabular-nums">
            Amount: {currencySymbol}
            {amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Bank Details Container */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-[#16161b] flex flex-col justify-between space-y-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
              Direct Wire / Instant Transfer
            </div>
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {bankDetails || "Studio Wire Account Details Available Upon Request."}
            </div>
          </div>

          {bankDetails && (
            <button
              type="button"
              onClick={handleCopyBank}
              className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Account Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5 text-zinc-400" />
                  <span>Copy Bank Details</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Slip Upload & Reference Input */}
      <div className="space-y-4">
        {/* Slip Dropzone */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Upload Transfer Receipt Slip *
          </label>

          {proofUrl ? (
            <div className="p-3 rounded-xl border border-zinc-700 bg-zinc-900 flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="size-12 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proofUrl} alt="Receipt proof" className="size-full object-cover" />
                </div>
                <div className="overflow-hidden">
                  <span className="text-xs font-medium text-white truncate block">
                    Receipt Slip Uploaded
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                    <Check className="size-3" /> Ready for verification
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setProofUrl(null)}
                className="p-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="relative border-2 border-dashed border-zinc-700 hover:border-amber-500/60 rounded-xl p-6 text-center bg-zinc-900/40 hover:bg-zinc-900/70 transition-all cursor-pointer">
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                {isUploading ? (
                  <>
                    <Loader2 className="size-8 text-amber-400 animate-spin" />
                    <span className="text-xs text-zinc-300 font-mono">Uploading Receipt Slip...</span>
                  </>
                ) : (
                  <>
                    <div className="size-10 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                      <Upload className="size-5" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-white">Click or drag receipt slip</span>
                      <span className="text-[10px] text-zinc-400 block mt-0.5 font-mono">
                        Supports PNG, JPG, WebP, PDF (Max 10MB)
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {uploadError && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertCircle className="size-3.5" />
              {uploadError}
            </p>
          )}
        </div>

        {/* Transaction Reference Number */}
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Bank Reference / Transaction Code (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. CHASE-TRX-8829104 or DUITNOW-KL-9901"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting || isUploading || !proofUrl}
          className="w-full py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Submitting for Verification...
            </>
          ) : (
            <>
              <QrCode className="size-4" />
              Submit Slip for Studio Verification
            </>
          )}
        </button>
        <p className="text-[10px] text-zinc-500 text-center mt-2 font-mono">
          Your slot is held while our front desk staff verifies the bank transfer.
        </p>
      </div>
    </form>
  );
}

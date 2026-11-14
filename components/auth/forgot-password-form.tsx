"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Mail, ArrowRight, AlertCircle, MailCheck } from "lucide-react";
import { requestPasswordReset } from "@/lib/actions/password-reset";

interface ForgotPasswordFormProps {
  tenantSlug: string;
  tenantName: string;
  initialEmail?: string;
}

export function ForgotPasswordForm({ tenantSlug, tenantName, initialEmail = "" }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await requestPasswordReset({ tenantSlug, email });
      if (res.success) setSentMessage(res.message);
      else setError(res.message);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 rounded-2xl bg-[#121215] border border-zinc-800 shadow-2xl space-y-6">
      <div className="text-center space-y-2">
        <div className="size-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto mb-3">
          {sentMessage ? <MailCheck className="size-6" aria-hidden="true" /> : <KeyRound className="size-6" aria-hidden="true" />}
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">{sentMessage ? "Check your email" : "Forgot password"}</span>
        <h1 className="text-2xl font-black tracking-tight text-white">{tenantName}</h1>
        {!sentMessage && (
          <p className="text-xs text-zinc-400">Enter the email you use for {tenantName} and we&apos;ll send you a link to choose a new password.</p>
        )}
      </div>

      {sentMessage ? (
        <div className="space-y-4">
          <p role="status" className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-200 leading-relaxed">
            {sentMessage}
          </p>
          <p className="text-xs text-zinc-400">
            No email after a few minutes? Check your spam folder, or{" "}
            <button type="button" onClick={() => setSentMessage(null)} className="text-amber-400 hover:text-amber-300 underline underline-offset-2">
              try again
            </button>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div role="alert" className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-300">
              <AlertCircle className="size-4 text-rose-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="forgot-email" className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
              <Mail className="size-3.5 text-amber-400" aria-hidden="true" />
              Email Address
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs tracking-wide uppercase transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span>Sending…</span>
            ) : (
              <>
                <span>Send reset link</span>
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </>
            )}
          </button>
        </form>
      )}

      <div className="pt-2 text-center">
        <Link href={`/${tenantSlug}/login`} className="text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors">
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}

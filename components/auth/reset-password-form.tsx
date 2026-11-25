"use client";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useState } from "react";
import Link from "next/link";
import { KeyRound, Lock, ArrowRight, AlertCircle } from "lucide-react";
import { resetPassword } from "@/lib/actions/password-reset";
import { PasswordVisibilityToggle } from "@/components/auth/password-visibility-toggle";
import { studioPath } from "@/lib/domain-name";

interface ResetPasswordFormProps {
  tenantSlug: string;
  tenantName: string;
  email: string;
  token: string;
  /** A team invite: welcome wording instead of "reset". */
  welcome?: boolean;
  /** "Use one sign-in for all your studios": wording for choosing one password for every studio. */
  join?: boolean;
  /** The person already has a CineFlow sign-in, and this password becomes its password. */
  hasLogin?: boolean;
}

const inputClass =
  "w-full pl-3.5 pr-10 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-sm text-white placeholder-zinc-500 outline-none transition-colors font-mono";

export function ResetPasswordForm({ tenantSlug, tenantName, email, token, welcome = false, join = false, hasLogin = false }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setLoading(true);
    try {
      const res = await resetPassword({ tenantSlug, email, token, password });
      if (res.success) {
        window.location.assign(studioPath(tenantSlug, `/login?reset=1&email=${encodeURIComponent(email)}`));
        return;
      }
      setExpired(res.error === "INVALID_LINK");
      setError(res.message);
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-md p-8 rounded-2xl bg-[#121215] border border-zinc-800 shadow-2xl space-y-6">
      <div className="text-center space-y-2">
        <div className="size-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto mb-3">
          <KeyRound className="size-6" aria-hidden="true" />
        </div>
        {join ? (
          <>
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">One sign-in</span>
            <h1 className="text-2xl font-bold tracking-tight text-white">Use one sign-in for all your studios</h1>
            <p className="text-sm text-zinc-400">Choose one password for every CineFlow studio you work with or book.</p>
          </>
        ) : welcome ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-white">Welcome to {tenantName}</h1>
            <p className="text-sm text-zinc-400">Set a password to start using your studio account.</p>
          </>
        ) : (
          <>
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">Choose a new password</span>
            <h1 className="text-2xl font-bold tracking-tight text-white">{tenantName}</h1>
          </>
        )}
        <p className="text-xs text-zinc-400 break-all">for {email}</p>
        {hasLogin && !join && (
          <p className="text-xs text-amber-300/90">
            {welcome ? "You already have a CineFlow sign-in. Enter its password to join this studio." : "You already have a CineFlow sign-in. Enter its password, or choose a new one."}
          </p>
        )}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div role="alert" className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="size-4 text-rose-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {error}{" "}
              {expired && (
                <Link href={studioPath(tenantSlug, `/forgot-password?email=${encodeURIComponent(email)}`)} className="underline underline-offset-2 text-rose-200">
                  Send a new link
                </Link>
              )}
            </span>
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="new-password" className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
            <Lock className="size-3.5 text-amber-400" aria-hidden="true" />
            {welcome ? "Password" : "New password"}
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? "text" : "password"}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={inputClass}
            />
            <PasswordVisibilityToggle visible={show} onToggle={() => setShow((v) => !v)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirm-password" className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
            <Lock className="size-3.5 text-amber-400" aria-hidden="true" />
            {welcome ? "Confirm password" : "Confirm new password"}
          </label>
          <input
            id="confirm-password"
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          {loading ? (
            <span>Saving…</span>
          ) : (
            <>
              <span>{join ? "Set my password" : welcome ? "Set my password" : "Save new password"}</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </>
          )}
        </button>
        {!welcome && !join && <p className="text-[11px] text-zinc-500 text-center">Saving signs you out on every other device.</p>}
      </form>
    </div>
  );
}

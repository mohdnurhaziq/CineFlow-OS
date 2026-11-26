"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Lock, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { loginToPlatform } from "@/lib/actions/one-login";
import { PasswordVisibilityToggle } from "@/components/auth/password-visibility-toggle";
import { platformUrl } from "@/lib/domain-name";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { googleErrorMessage } from "@/lib/auth/google-messages";
import { googleStartHref } from "@/lib/auth/google-links";

const ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: "Wrong email or password.",
  RATE_LIMITED: "Too many attempts. Wait a few minutes and try again.",
};

const inputClass =
  "w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-sm text-white placeholder-zinc-400 outline-none transition-colors";

/** The one-login sign-in on the platform's page: email and password, then "Your studios". */
export function PlatformAccountLoginForm({ googleEnabled = false, googleError = null }: { googleEnabled?: boolean; googleError?: string | null }) {
  const googleMessage = googleErrorMessage(googleError);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await loginToPlatform(email, password);
      if (!res.success) {
        setError(ERRORS[res.error] ?? "Sign-in isn't working right now. Try again in a moment.");
        setLoading(false);
        return;
      }
      window.location.href = res.redirectTo;
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6 rounded-2xl border border-zinc-800 bg-[#121215] p-6 shadow-2xl sm:p-8">
      <div className="space-y-2 text-center">
        <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400">Sign in</span>
        <h1 className="text-2xl font-bold tracking-tight text-white">Your CineFlow sign-in</h1>
        <p className="text-xs text-zinc-400">
          One sign-in for every studio you work with or book. You can also sign in on a studio&apos;s own page.
        </p>
      </div>

      {googleMessage && !error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-300">
          <AlertCircle className="mt-0.5 size-4 flex-shrink-0 text-rose-400" aria-hidden="true" />
          <span>{googleMessage}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-300">
          <AlertCircle className="mt-0.5 size-4 flex-shrink-0 text-rose-400" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="account-email" className="flex items-center gap-1.5 text-xs font-mono text-zinc-300">
            <Mail className="size-3.5 text-amber-400" aria-hidden="true" />
            Email
          </label>
          <input id="account-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="account-password" className="flex items-center gap-1.5 text-xs font-mono text-zinc-300">
            <Lock className="size-3.5 text-amber-400" aria-hidden="true" />
            Password
          </label>
          <div className="relative">
            <input
              id="account-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className={cn(inputClass, "pr-10 font-mono")}
            />
            <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </div>
        </div>
        <button type="submit" disabled={loading} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          {loading ? (
            <span>Signing in…</span>
          ) : (
            <>
              <span>Sign in</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      {googleEnabled && (
        <div className="space-y-4">
          <OrDivider />
          <GoogleButton href={googleStartHref(null)} />
        </div>
      )}

      <p className="text-center text-xs text-zinc-400">
        Don&apos;t have one yet? It starts when you confirm your email from a studio you use.{" "}
        <Link href={platformUrl("/")} className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
          Back to CineFlow OS
        </Link>
      </p>
    </div>
  );
}

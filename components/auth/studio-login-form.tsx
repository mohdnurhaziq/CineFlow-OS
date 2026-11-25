"use client";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Film, Lock, Mail, ArrowRight, ShieldCheck, UserCheck, AlertCircle, Sparkles } from "lucide-react";
import { signInTarget } from "@/lib/auth/sign-in-target";
import { loginWithCredentials } from "@/lib/auth/session";
import { continueAsClient } from "@/lib/actions/one-login";
import { PasswordVisibilityToggle } from "@/components/auth/password-visibility-toggle";
import type { DemoPersonas } from "@/lib/demo-studios";
import { isSafeRelativePath, studioPath } from "@/lib/domain-name";

interface StudioLoginFormProps {
  tenantSlug: string;
  tenantName: string;
  /** The demo studios' accounts, offered as shortcuts (dev and staging only; see lib/demo-studios). */
  demo: DemoPersonas | null;
}

export function StudioLoginForm({ tenantSlug, tenantName, demo }: StudioLoginFormProps) {
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get("callbackUrl");
  // Only allow same-site relative paths to prevent open redirects.
  const callbackUrl = rawCallback && isSafeRelativePath(rawCallback) ? rawCallback : null;

  // After a password reset the email comes back filled in.
  const justReset = searchParams.get("reset") === "1";
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Signed in with their one login, but this studio has no account for them yet.
  const [offerClient, setOfferClient] = useState(false);

  const continueHere = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await continueAsClient(tenantSlug);
      if (res.success) {
        window.location.href = res.redirectTo;
        return;
      }
      setError(res.message);
    } catch {
      setError("An unexpected network error occurred.");
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOfferClient(false);
    setLoading(true);

    try {
      const result = await loginWithCredentials(email, password, tenantSlug);
      if (!result.success) {
        if (result.error === "NO_ACCOUNT_HERE") {
          setOfferClient(true);
          setLoading(false);
          return;
        }
        if (result.error === "INVALID_CREDENTIALS") {
          setError("Invalid email or password. Please verify your credentials.");
        } else if (result.error === "RATE_LIMITED") {
          setError("Too many attempts. Please wait a few minutes and try again.");
        } else if (result.error === "TENANT_MISMATCH") {
          setError(`Account does not have access permissions for ${tenantName}.`);
        } else if (result.error === "ACCOUNT_REMOVED") {
          setError("This account was removed by the studio.");
        } else {
          setError("Authentication service temporarily unavailable. Please retry.");
        }
        setLoading(false);
        return;
      }

      const target = signInTarget({ role: result.user?.role, tenantSlug, callbackUrl });
      window.location.href = target;
    } catch {
      setError("An unexpected network error occurred.");
      setLoading(false);
    }
  };

  const setDemoUser = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("password123");
    setError(null);
  };

  return (
    <div className="w-full max-w-md p-8 rounded-2xl bg-[#121215] border border-zinc-800 shadow-2xl space-y-6">
      {/* Studio Header */}
      <div className="text-center space-y-2">
        <div className="size-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto mb-3">
          <Film className="size-6" />
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
          Sign in
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-white">{tenantName}</h1>
        <p className="text-xs text-zinc-400">
          Clients: see your bookings, photos and invoices. Studio team: open the admin suite.
        </p>
      </div>

      {justReset && !error && (
        <div role="status" className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200">
          Password updated. Sign in with your new password.
        </div>
      )}

      {offerClient && (
        <div role="status" className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-3 text-center">
          <p className="text-sm text-amber-100">You don&apos;t have an account with {tenantName} yet.</p>
          <button type="button" onClick={continueHere} disabled={loading} className={cn(buttonVariants({ size: "lg" }), "h-auto min-h-12 w-full whitespace-normal py-3 text-center")}>
            Continue as a client of {tenantName}
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-300">
          <AlertCircle className="size-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
            <Mail className="size-3.5 text-amber-400" />
            Email Address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
              <Lock className="size-3.5 text-amber-400" />
              Password
            </label>
            <Link
              href={studioPath(tenantSlug, `/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`)}
              className="text-[11px] font-mono text-amber-400 hover:text-amber-300 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full pl-3.5 pr-10 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-sm text-white placeholder-zinc-500 outline-none transition-colors font-mono"
            />
            <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          {loading ? (
            <span>Authenticating...</span>
          ) : (
            <>
              <span>Sign in</span>
              <ArrowRight className="size-3.5" />
            </>
          )}
        </button>
      </form>

      {/* Demo Credentials Quick-Switcher (seeded demo studios only) */}
      {demo && (
        <div className="pt-4 border-t border-zinc-800/80 space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
            <Sparkles className="size-3.5 text-amber-400" />
            <span>Quick Demo Personas (password123):</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDemoUser(demo.owner)}
              className="p-2 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-left transition-colors"
            >
              <div className="text-[11px] font-bold text-zinc-200 flex items-center gap-1">
                <ShieldCheck className="size-3 text-amber-400" />
                Studio Owner
              </div>
              <div className="text-[10px] text-zinc-500 truncate">{demo.owner}</div>
            </button>

            <button
              type="button"
              onClick={() => setDemoUser(demo.staff)}
              className="p-2 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-left transition-colors"
            >
              <div className="text-[11px] font-bold text-zinc-200 flex items-center gap-1">
                <UserCheck className="size-3 text-blue-400" />
                Staff / Photo
              </div>
              <div className="text-[10px] text-zinc-500 truncate">{demo.staff}</div>
            </button>
          </div>
        </div>
      )}

      <div className="pt-2 text-center space-y-2">
        <Link
          href={
            callbackUrl && !callbackUrl.includes("/admin")
              ? studioPath(tenantSlug, `/register?next=${encodeURIComponent(callbackUrl)}`)
              : studioPath(tenantSlug, "/register")
          }
          className="block text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors"
        >
          New client? Create a quick account
        </Link>
        <Link
          href={studioPath(tenantSlug)}
          className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Back to studio website
        </Link>
      </div>
    </div>
  );
}

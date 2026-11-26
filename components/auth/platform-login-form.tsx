"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, Lock, Mail, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { loginPlatformAdmin } from "@/lib/auth/session";
import { PasswordVisibilityToggle } from "@/components/auth/password-visibility-toggle";

const ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: "Wrong email or password.",
  RATE_LIMITED: "Too many attempts. Wait a few minutes and try again.",
  ACCOUNT_REMOVED: "This super-admin account was removed.",
};

/** The platform super-admin's sign-in form (see app/(saas)/super-admin/login). */
export function PlatformLoginForm() {
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
      const result = await loginPlatformAdmin(email, password);
      if (!result.success) {
        setError(ERRORS[result.error ?? ""] ?? "Sign-in isn't working right now. Try again in a moment.");
        setLoading(false);
        return;
      }
      window.location.href = "/super-admin";
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-sm text-white placeholder-zinc-400 outline-none transition-colors";

  return (
    <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-[#121215] border border-zinc-800 shadow-2xl space-y-6">
      <div className="text-center space-y-2">
        <div className="size-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto mb-3">
          <ShieldCheck className="size-6" />
        </div>
        <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400">Platform sign-in</span>
        <h1 className="text-2xl font-bold tracking-tight text-white">CineFlow OS super-admin</h1>
        <p className="text-xs text-zinc-400">Studio teams and clients sign in on their studio&apos;s own page.</p>
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-300">
          <AlertCircle className="size-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="platform-email" className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
            <Mail className="size-3.5 text-amber-400" />
            Email
          </label>
          <input
            id="platform-email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="platform-password" className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
            <Lock className="size-3.5 text-amber-400" />
            Password
          </label>
          <div className="relative">
            <input
              id="platform-password"
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
              <ArrowRight className="size-3.5" />
            </>
          )}
        </button>
      </form>

      <p className="text-[11px] text-zinc-400 leading-relaxed">
        Forgot the password? On the server, in the production folder, run this to set a new one:
        <code className="block mt-1.5 px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-zinc-300 break-words">
          node scripts/ops.mjs create-super-admin &lt;your email&gt;
        </code>
      </p>
    </div>
  );
}

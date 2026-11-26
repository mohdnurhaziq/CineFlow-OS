"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Lock, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { loginToPlatform, type StudioChoice } from "@/lib/actions/one-login";
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

/**
 * Sign-in on the platform's page: email and password. A person with one login goes to "Your studios";
 * an account without one goes to its studio, after choosing when the password opens several.
 */
export function PlatformAccountLoginForm({ googleEnabled = false, googleError = null }: { googleEnabled?: boolean; googleError?: string | null }) {
  const googleMessage = googleErrorMessage(googleError);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [choices, setChoices] = useState<StudioChoice[] | null>(null);

  const signIn = async (studioSlug?: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await loginToPlatform(email, password, studioSlug);
      if (!res.success && res.error === "CHOOSE_STUDIO") {
        setChoices(res.studios);
        setLoading(false);
        return;
      }
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setChoices(null);
    void signIn();
  };

  return (
    <div className="w-full max-w-md space-y-6 rounded-2xl border border-zinc-800 bg-[#121215] p-6 shadow-2xl sm:p-8">
      <div className="space-y-2 text-center">
        <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400">Sign in</span>
        <h1 className="text-2xl font-bold tracking-tight text-white">Your CineFlow sign-in</h1>
        <p className="text-xs text-zinc-400">
          Use the email and password you sign in to your studio with. You can also sign in on a studio&apos;s own page.
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
          <input id="account-email" type="email" required autoComplete="username" value={email} onChange={(e) => {
            setEmail(e.target.value);
            setChoices(null);
          }} placeholder="you@example.com" className={inputClass} />
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
              onChange={(e) => {
                setPassword(e.target.value);
                setChoices(null);
              }}
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

      {choices && (
        <section aria-labelledby="which-studio" className="space-y-2">
          <h2 id="which-studio" className="text-sm font-semibold text-white">
            Which studio?
          </h2>
          <ul className="space-y-2">
            {choices.map((c) => (
              <li key={c.slug}>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void signIn(c.slug)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-left text-sm text-white hover:border-amber-500/60 disabled:opacity-60"
                >
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="shrink-0 text-[11px] font-mono uppercase tracking-wider text-zinc-400">{c.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {googleEnabled && (
        <div className="space-y-4">
          <OrDivider />
          <GoogleButton href={googleStartHref(null)} />
        </div>
      )}

      <p className="text-center text-xs text-zinc-400">
        Forgot your password? Reset it on your studio&apos;s own sign-in page. New here?{" "}
        <Link href={platformUrl("/create-studio")} className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
          Start your studio
        </Link>
      </p>
    </div>
  );
}

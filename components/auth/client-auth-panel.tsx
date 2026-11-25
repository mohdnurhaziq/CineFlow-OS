"use client";

import { useId, useState, type ComponentType, type InputHTMLAttributes } from "react";
import { User, Mail, Phone, Lock, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { registerClient } from "@/lib/actions/client-auth";
import { loginWithCredentials, logoutAction } from "@/lib/auth/session";
import { continueAsClient } from "@/lib/actions/one-login";
import { handoffNavigate } from "@/lib/auth/handoff-client";
import { OrDivider } from "@/components/auth/google-button";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { googleErrorMessage } from "@/lib/auth/google-messages";
import { googleStartHref } from "@/lib/auth/google-links";
import { PasswordVisibilityToggle } from "@/components/auth/password-visibility-toggle";
import { studioPath } from "@/lib/domain-name";

interface ClientAuthPanelProps {
  tenantSlug: string;
  /** Called after a successful sign-in or account creation. */
  onSuccess: () => void;
  defaultMode?: "register" | "login";
  /** From a studio invite email: proves ownership of the account the studio created. */
  inviteToken?: string;
  defaultEmail?: string;
  /** Pre-filled from the account a valid studio invite belongs to. */
  defaultName?: string;
  defaultPhone?: string;
  /**
   * Where a set-password email (sent when the email already has an account) brings them back to:
   * true for the page they're on now (a checkout). Default: their account.
   */
  returnHere?: boolean;
  /** Google sign-in is set up: show "Continue with Google" (not in a booking or checkout, which Google would leave). */
  googleEnabled?: boolean;
  /** Why Google sign-in came back (`?google=`), if it did. */
  googleError?: string | null;
}

const inputClass =
  "w-full pl-9 py-2 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500 placeholder-zinc-500";

/**
 * Text input with a visible label (placeholders disappear while typing, so they can't be the label).
 * A password field gets a show/hide toggle.
 */
function Field({
  label,
  icon: Icon,
  className = "",
  type,
  ...input
}: { label: string; icon: ComponentType<{ className?: string }> } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const isPassword = type === "password";
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[11px] font-semibold text-zinc-300">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3 top-2.5 size-4 text-zinc-500 pointer-events-none" aria-hidden="true" />
        <input
          id={id}
          type={isPassword && showPassword ? "text" : type}
          className={`${inputClass} ${isPassword ? "pr-10" : "pr-3"} ${className}`}
          {...input}
        />
        {isPassword && (
          <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
        )}
      </div>
    </div>
  );
}

export function ClientAuthPanel({
  tenantSlug,
  onSuccess,
  defaultMode = "register",
  inviteToken,
  defaultEmail = "",
  defaultName = "",
  defaultPhone = "",
  returnHere = false,
  googleEnabled = false,
  googleError = null,
}: ClientAuthPanelProps) {
  const googleMessage = googleErrorMessage(googleError);
  const [mode, setMode] = useState<"register" | "login">(defaultMode);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Not an error: the account exists and its owner has been emailed a link to set the password.
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Signed in with their one login, but this studio has no account for them yet.
  const [offerClient, setOfferClient] = useState(false);
  const [signedIn, setSignedIn] = useState<{ name: string; kind: "created" | "signedIn" } | null>(null);

  const switchMode = (next: "register" | "login") => {
    setMode(next);
    setError(null);
    setNotice(null);
    setOfferClient(false);
  };

  const continueHere = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await continueAsClient(tenantSlug);
      if (res.success) await confirmSignedIn(res.name, "created", res.handoffCode);
      else setError(res.message);
    } catch {
      setError("An unexpected network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /** Shows an explicit "you're signed in" state, then hands control back to the host page. */
  const confirmSignedIn = async (displayName: string, kind: "created" | "signedIn", handoffCode?: string) => {
    setSignedIn({ name: displayName, kind });
    await new Promise((resolve) => setTimeout(resolve, 1400));
    // On a studio's own domain the sign-in is carried over to the platform host, then back to this page.
    if (handoffCode) {
      handoffNavigate(handoffCode, `${window.location.pathname}${window.location.search}`);
      return;
    }
    onSuccess();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setOfferClient(false);
    setLoading(true);

    try {
      if (mode === "register") {
        const res = await registerClient({
          tenantSlug,
          name,
          email,
          phone,
          password,
          inviteToken: inviteToken || undefined,
          next: returnHere ? `${window.location.pathname}${window.location.search}` : undefined,
        });
        if (!res.success) {
          if (res.error === "CHECK_EMAIL") setNotice(res.message);
          else setError(res.message);
          return;
        }
        await confirmSignedIn(res.user.name, "created", res.handoffCode);
      } else {
        const res = await loginWithCredentials(email, password, tenantSlug);
        if (!res.success && res.error === "NO_ACCOUNT_HERE") {
          setOfferClient(true);
          return;
        }
        if (!res.success) {
          setError(
            res.error === "RATE_LIMITED"
              ? "Too many attempts. Please wait a few minutes and try again."
              : res.error === "TENANT_MISMATCH"
                ? "This account belongs to a different studio."
                : res.error === "INVALID_CREDENTIALS"
                  ? "Invalid email or password."
                  : res.error === "ACCOUNT_REMOVED"
                    ? "This account was removed by the studio."
                    : "Sign-in is temporarily unavailable. Please retry."
          );
          return;
        }
        if (res.user?.role !== "CLIENT") {
          await logoutAction();
          setError("That is a studio staff account. Please use Studio Login instead.");
          return;
        }
        await confirmSignedIn(res.user.name, "signedIn", res.handoffCode);
      }
    } catch {
      setError("An unexpected network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (signedIn) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2"
      >
        <CheckCircle2 className="size-8 text-emerald-400 mx-auto" />
        <div className="text-sm font-bold text-white">
          {signedIn.kind === "created" ? "Account created" : "Welcome back"}, {signedIn.name.split(" ")[0]}
        </div>
        <p className="text-xs text-emerald-300">You&apos;re now signed in. Continuing…</p>
        <Loader2 className="size-3.5 animate-spin text-emerald-400 mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#18181b] border border-zinc-800">
        {(
          [
            ["register", "Create account"],
            ["login", "I have an account"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => switchMode(id)}
            className={`py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
              mode === id ? "bg-amber-500 text-black" : "text-zinc-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2 text-xs text-rose-300"
          >
            <AlertCircle className="size-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {googleMessage && !error && (
          <div role="alert" className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2 text-xs text-rose-300">
            <AlertCircle className="size-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>{googleMessage}</span>
          </div>
        )}
        {offerClient && (
          <div role="status" className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2 text-xs text-amber-100">
            <p>You don&apos;t have an account with this studio yet.</p>
            <button type="button" onClick={continueHere} disabled={loading} className="w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-60">
              Continue as a client of this studio
            </button>
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-xs text-amber-200"
          >
            <Mail className="size-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        {mode === "register" && (
          <Field
            label="Full name"
            icon={User}
            type="text"
            autoComplete="name"
            placeholder="As it should appear on invoices"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}

        <Field
          label="Email address"
          icon={Mail}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {mode === "register" && (
          <Field
            label="Mobile number (WhatsApp)"
            icon={Phone}
            type="tel"
            autoComplete="tel"
            placeholder="Include country code"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="font-mono"
            required
          />
        )}

        <Field
          label="Password"
          icon={Lock}
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          placeholder={mode === "register" ? "At least 8 characters" : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="font-mono"
          minLength={mode === "register" ? 8 : undefined}
          required
        />
        {mode === "login" && (
          <div className="-mt-2 text-right">
            <a
              href={studioPath(tenantSlug, `/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`)}
              className="text-[11px] font-mono text-amber-400 hover:text-amber-300 transition-colors"
            >
              Forgot password?
            </a>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider disabled:opacity-50 transition-colors"
        >
          {loading && <Loader2 className="size-3.5 animate-spin" />}
          {mode === "register" ? "Create account & continue" : "Sign in & continue"}
        </button>
      </form>

      {googleEnabled && (
        <div className="space-y-3">
          <OrDivider />
          <GoogleSignInButton href={googleStartHref(tenantSlug)} />
        </div>
      )}
    </div>
  );
}

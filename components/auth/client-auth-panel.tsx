"use client";

import { useId, useState, type ComponentType, type InputHTMLAttributes } from "react";
import { User, Mail, Phone, Lock, Hash, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { registerClient } from "@/lib/actions/client-auth";
import { loginWithCredentials, logoutAction } from "@/lib/auth/session";
import { PasswordVisibilityToggle } from "@/components/auth/password-visibility-toggle";

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
}: ClientAuthPanelProps) {
  const [mode, setMode] = useState<"register" | "login">(defaultMode);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [password, setPassword] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [needsClaim, setNeedsClaim] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState<{ name: string; kind: "created" | "signedIn" } | null>(null);

  const switchMode = (next: "register" | "login") => {
    setMode(next);
    setError(null);
    setNeedsClaim(false);
  };

  /** Shows an explicit "you're signed in" state, then hands control back to the host page. */
  const confirmSignedIn = async (displayName: string, kind: "created" | "signedIn") => {
    setSignedIn({ name: displayName, kind });
    await new Promise((resolve) => setTimeout(resolve, 1400));
    onSuccess();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "register") {
        const res = await registerClient({
          tenantSlug,
          name,
          email,
          phone,
          password,
          claimCode: needsClaim ? claimCode : undefined,
          inviteToken: inviteToken || undefined,
        });
        if (!res.success) {
          if (res.error === "CLAIM_REQUIRED" || res.error === "CLAIM_INVALID") setNeedsClaim(true);
          setError(res.message);
          return;
        }
        await confirmSignedIn(res.user.name, "created");
      } else {
        const res = await loginWithCredentials(email, password, tenantSlug);
        if (!res.success) {
          setError(
            res.error === "RATE_LIMITED"
              ? "Too many attempts. Please wait a few minutes and try again."
              : res.error === "TENANT_MISMATCH"
                ? "This account belongs to a different studio."
                : res.error === "INVALID_CREDENTIALS"
                  ? "Invalid email or password."
                  : "Sign-in is temporarily unavailable. Please retry."
          );
          return;
        }
        if (res.user?.role !== "CLIENT") {
          await logoutAction();
          setError("That is a studio staff account. Please use Studio Login instead.");
          return;
        }
        await confirmSignedIn(res.user.name, "signedIn");
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

        {mode === "register" && needsClaim && (
          <Field
            label="Tracking code"
            icon={Hash}
            type="text"
            autoComplete="off"
            placeholder="From your earlier booking"
            value={claimCode}
            onChange={(e) => setClaimCode(e.target.value)}
            className="font-mono uppercase"
            required
          />
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
    </div>
  );
}

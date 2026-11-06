"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Film, Lock, Mail, ArrowRight, ShieldCheck, UserCheck, AlertCircle, Sparkles } from "lucide-react";
import { loginWithCredentials } from "@/lib/auth/session";

/** Seeded demo studios only; real studios never show demo logins. */
const DEMO_PERSONAS: Record<string, { owner: string; staff: string }> = {
  "lumina-cine": { owner: "alex@luminacine.com", staff: "sarah@luminacine.com" },
  "apex-media": { owner: "david@apexmedia.com", staff: "aisyah@apexmedia.com" },
};

interface StudioLoginFormProps {
  tenantSlug: string;
  tenantName: string;
}

export function StudioLoginForm({ tenantSlug, tenantName }: StudioLoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get("callbackUrl");
  // Only allow same-site relative paths to prevent open redirects.
  const callbackUrl =
    rawCallback && rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await loginWithCredentials(email, password, tenantSlug);
      if (!result.success) {
        if (result.error === "INVALID_CREDENTIALS") {
          setError("Invalid email or password. Please verify your credentials.");
        } else if (result.error === "RATE_LIMITED") {
          setError("Too many attempts. Please wait a few minutes and try again.");
        } else if (result.error === "TENANT_MISMATCH") {
          setError(`Account does not have access permissions for ${tenantName}.`);
        } else {
          setError("Authentication service temporarily unavailable. Please retry.");
        }
        setLoading(false);
        return;
      }

      const isClient = result.user?.role === "CLIENT";
      const target = isClient
        ? callbackUrl && !callbackUrl.includes("/admin")
          ? callbackUrl
          : `/${tenantSlug}/account`
        : callbackUrl || `/${tenantSlug}/admin`;
      router.push(target);
      router.refresh();
    } catch {
      setError("An unexpected network error occurred.");
      setLoading(false);
    }
  };

  const demo = DEMO_PERSONAS[tenantSlug];

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
        <h1 className="text-2xl font-black tracking-tight text-white">{tenantName}</h1>
        <p className="text-xs text-zinc-400">
          Clients: see your bookings, photos and invoices. Studio team: open the admin suite.
        </p>
      </div>

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
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-sm text-white placeholder-zinc-500 outline-none transition-colors font-mono"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs tracking-wide uppercase transition-colors shadow-sm shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50"
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
              ? `/${tenantSlug}/register?next=${encodeURIComponent(callbackUrl)}`
              : `/${tenantSlug}/register`
          }
          className="block text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors"
        >
          New client? Create a quick account
        </Link>
        <Link
          href={`/${tenantSlug}`}
          className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Return to Public Studio Showcase
        </Link>
      </div>
    </div>
  );
}

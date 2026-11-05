"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientAuthPanel } from "@/components/auth/client-auth-panel";

interface ClientRegisterCardProps {
  tenantSlug: string;
  tenantName: string;
  defaultMode?: "register" | "login";
}

export function ClientRegisterCard({ tenantSlug, tenantName, defaultMode = "register" }: ClientRegisterCardProps) {
  const router = useRouter();

  return (
    <div className="w-full max-w-md p-8 rounded-2xl bg-[#121215] border border-zinc-800 shadow-2xl space-y-5">
      <div className="space-y-2 text-center">
        <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">Client Account</span>
        <h1 className="text-2xl font-black tracking-tight text-white">{tenantName}</h1>
        <p className="text-xs text-zinc-400">
          Create a quick account to book sessions, track your booking status and see your photos,
          invoices and deliveries in one place.
        </p>
      </div>

      <ClientAuthPanel
        tenantSlug={tenantSlug}
        defaultMode={defaultMode}
        // One navigation only: a refresh here re-renders /register, which itself redirects signed-in
        // clients, and the two navigations race (the page could be left blank). /account is
        // dynamic, so it renders fresh with the new session; replace keeps /register out of history.
        onSuccess={() => router.replace(`/${tenantSlug}/account`)}
      />

      <div className="flex items-center justify-between text-xs font-mono text-zinc-500">
        <Link href={`/${tenantSlug}`} className="hover:text-zinc-300 transition-colors">
          ← Studio showcase
        </Link>
        <Link href={`/${tenantSlug}/login`} className="hover:text-zinc-300 transition-colors">
          Studio staff login
        </Link>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientAuthPanel } from "@/components/auth/client-auth-panel";
import { studioPath } from "@/lib/domain-name";

interface CheckoutAuthGateProps {
  tenantSlug: string;
  tenantName: string;
}

/** Shown on the checkout page when a slot booking is started without a client account. */
export function CheckoutAuthGate({ tenantSlug, tenantName }: CheckoutAuthGateProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[#121215] border border-zinc-800 shadow-2xl space-y-5">
        <div className="space-y-2 text-center">
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
            One quick step
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white">{tenantName}</h1>
          <p className="text-xs text-zinc-400">
            Create a quick account (name, email, phone and password) or sign in to complete this
            booking. Your selected time is kept for you while you do.
          </p>
        </div>

        <ClientAuthPanel tenantSlug={tenantSlug} onSuccess={() => router.refresh()} />

        <div className="text-center">
          <Link
            href={studioPath(tenantSlug, "/book")}
            className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← Back to calendar
          </Link>
        </div>
      </div>
    </div>
  );
}

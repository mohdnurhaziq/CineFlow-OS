"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone, MessageSquare, Pencil, AlertCircle } from "lucide-react";
import { updateClientDetails } from "@/lib/actions/admin-clients";
import type { ClientAccountStatus } from "@/lib/client-directory-labels";
import { ClientAccountBadge } from "@/components/admin/clients/client-account-badge";

interface ClientContactCardProps {
  tenantId: string;
  tenantSlug: string;
  client: {
    id: string;
    name: string;
    email: string;
    /** Shown phone: the account's, else the latest booking's. */
    phone: string | null;
    /** The phone on the account itself, which the form edits. */
    accountPhone: string | null;
    accountStatus: ClientAccountStatus;
  };
  clientSinceLabel: string;
  bookingCount: number;
}

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-sm text-white placeholder-zinc-500 outline-none transition-colors";

export function ClientContactCard({ tenantId, tenantSlug, client, clientSinceLabel, bookingCount }: ClientContactCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.email);
  const [phone, setPhone] = useState(client.accountPhone ?? client.phone ?? "");
  const [syncBookings, setSyncBookings] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const phoneDigits = client.phone?.replace(/[^0-9]/g, "") ?? "";
  const emailChanged = email.trim().toLowerCase() !== client.email.trim().toLowerCase();

  function startEditing() {
    setName(client.name);
    setEmail(client.email);
    setPhone(client.accountPhone ?? client.phone ?? "");
    setSyncBookings(true);
    setError(null);
    setEditing(true);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateClientDetails({ tenantId, tenantSlug, clientId: client.id, name, email, phone, syncBookings });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#121215] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h1 className="text-xl font-black tracking-tight text-white break-words">{client.name}</h1>
          <ClientAccountBadge status={client.accountStatus} />
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-11 sm:min-h-0 rounded-lg border border-zinc-800 hover:border-zinc-700 text-xs font-mono text-zinc-300 hover:text-white transition-colors"
          >
            <Pencil className="size-3.5 text-amber-400" aria-hidden="true" />
            Edit details
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="space-y-3">
          {error && (
            <div role="alert" className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2 text-xs text-rose-300">
              <AlertCircle className="size-4 text-rose-400 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-mono text-zinc-400">Name</span>
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="off" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-mono text-zinc-400">Email</span>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="off" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-mono text-zinc-400">Phone</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} autoComplete="off" placeholder="Optional" />
            </label>
          </div>

          {emailChanged && client.accountStatus === "REGISTERED" && (
            <p className="text-xs text-amber-300">
              This client signs in with their email. After saving, they will need to sign in with the new address.
            </p>
          )}

          {bookingCount > 0 && (
            <label className="flex items-start gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={syncBookings}
                onChange={(e) => setSyncBookings(e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <span>
                Also update {bookingCount === 1 ? "their booking" : `their ${bookingCount} bookings`}, so confirmation emails and the
                booking pages use the new details.
              </span>
            </label>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold uppercase tracking-wide disabled:opacity-50 transition-colors"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setEditing(false)}
              className="px-4 py-2 rounded-lg border border-zinc-800 text-xs font-mono text-zinc-300 hover:text-white disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-x-5 text-sm">
            <a href={`mailto:${client.email}`} className="inline-flex items-center gap-2 text-zinc-300 hover:text-amber-400 transition-colors min-w-0">
              <Mail className="size-3.5 text-amber-400 shrink-0" aria-hidden="true" />
              <span className="truncate">{client.email}</span>
            </a>
            {client.phone ? (
              <>
                <a href={`tel:${client.phone}`} className="inline-flex items-center gap-2 text-zinc-300 hover:text-amber-400 transition-colors">
                  <Phone className="size-3.5 text-amber-400" aria-hidden="true" />
                  {client.phone}
                </a>
                {phoneDigits.length >= 7 && (
                  <a
                    href={`https://wa.me/${phoneDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-zinc-300 hover:text-emerald-400 transition-colors"
                  >
                    <MessageSquare className="size-3.5 text-emerald-400" aria-hidden="true" />
                    WhatsApp
                  </a>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-2 text-zinc-500">
                <Phone className="size-3.5" aria-hidden="true" />
                No phone on file
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-zinc-500">Client since {clientSinceLabel}</p>
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Inbox, Mail, Phone } from "lucide-react";
import { setInviteRequestHandled, type InviteRequestRow } from "@/lib/actions/invite-requests";

const KIND: Record<string, string> = { PHOTO: "Photo", VIDEO: "Video", BOTH: "Photo and video" };
const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });

/** People who asked for an invite on the landing page. Open ones first; handled ones fade. */
export function InviteRequestsPanel({ invites: initial }: { invites: InviteRequestRow[] }) {
  // Kept locally and updated right after each toggle, so the list needs no page refresh.
  const [invites, setInvites] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const open = invites.filter((i) => !i.handledAt);
  const handled = invites.filter((i) => i.handledAt);

  const toggle = async (i: InviteRequestRow) => {
    setBusyId(i.id);
    try {
      const res = await setInviteRequestHandled({ id: i.id, handled: !i.handledAt });
      if (res.success) {
        const handledAt = i.handledAt ? null : new Date().toISOString();
        setInvites((rows) => rows.map((r) => (r.id === i.id ? { ...r, handledAt } : r)));
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby="invites-h" className="space-y-4">
      <div className="flex items-center gap-3">
        <Inbox className="size-5 text-amber-400" aria-hidden="true" />
        <h2 id="invites-h" className="text-lg font-bold text-white tracking-tight">
          Invite requests
        </h2>
        <span className="text-xs font-mono text-zinc-400">{open.length} open</span>
      </div>

      {invites.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-[#121215] px-4 py-8 text-center text-sm text-zinc-400">No invite requests yet.</p>
      ) : (
        <ul className="space-y-3">
          {[...open, ...handled].map((i) => (
            <li key={i.id} className={`rounded-xl border border-zinc-800 bg-[#121215] p-4 space-y-2 ${i.handledAt ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-white">{i.studioName}</div>
                  <div className="text-xs text-zinc-400">
                    {i.name} · {KIND[i.kind] ?? i.kind} · {when(i.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyId === i.id}
                  onClick={() => toggle(i)}
                  className="px-3 py-2 rounded-lg text-xs font-mono font-semibold min-h-10 bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {i.handledAt ? "Reopen" : "Mark handled"}
                </button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <a href={`mailto:${i.email}`} className="inline-flex items-center gap-1.5 text-amber-400 hover:underline">
                  <Mail className="size-3.5" aria-hidden="true" />
                  {i.email}
                </a>
                {i.phone && (
                  <a href={`tel:${i.phone}`} className="inline-flex items-center gap-1.5 text-amber-400 hover:underline">
                    <Phone className="size-3.5" aria-hidden="true" />
                    {i.phone}
                  </a>
                )}
              </div>
              {i.message && <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words">{i.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

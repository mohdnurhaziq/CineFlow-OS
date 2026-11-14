"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, Lock } from "lucide-react";
import { updateClientNotes } from "@/lib/actions/admin-clients";

const MAX_LENGTH = 5000;

interface ClientNotesCardProps {
  tenantId: string;
  tenantSlug: string;
  clientId: string;
  notes: string;
}

/** The studio's private notes about a client. Saved explicitly; never shown to the client. */
export function ClientNotesCard({ tenantId, tenantSlug, clientId, notes }: ClientNotesCardProps) {
  const router = useRouter();
  const [value, setValue] = useState(notes);
  const [saved, setSaved] = useState(notes);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const dirty = value !== saved;

  function save() {
    setStatus(null);
    startTransition(async () => {
      const result = await updateClientNotes({ tenantId, tenantSlug, clientId, notes: value });
      if (!result.success) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      setSaved(value);
      setStatus({ kind: "ok", text: "Notes saved." });
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden">
      <h2 className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800 text-xs font-mono uppercase tracking-wider text-zinc-300">
        <span className="flex items-center gap-2">
          <NotebookPen className="size-3.5 text-amber-400" aria-hidden="true" />
          Studio notes
        </span>
        <span className="flex items-center gap-1 normal-case tracking-normal text-[11px] text-zinc-500">
          <Lock className="size-3" aria-hidden="true" />
          Only your team sees these
        </span>
      </h2>
      <div className="p-4 space-y-3">
        <label htmlFor={`notes-${clientId}`} className="sr-only">
          Studio notes about this client
        </label>
        <textarea
          id={`notes-${clientId}`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus(null);
          }}
          maxLength={MAX_LENGTH}
          rows={4}
          placeholder="Preferences, reminders, anything the team should know before the next session…"
          className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-sm text-white placeholder-zinc-500 outline-none transition-colors resize-y"
        />
        <div className="flex items-center justify-between gap-3">
          <span
            role="status"
            aria-live="polite"
            className={status?.kind === "error" ? "text-xs text-rose-300" : "text-xs text-emerald-400"}
          >
            {status?.text ?? ""}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
              {value.length.toLocaleString("en-US")}/{MAX_LENGTH.toLocaleString("en-US")}
            </span>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || isPending}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold uppercase tracking-wide disabled:opacity-40 transition-colors"
            >
              {isPending ? "Saving…" : "Save notes"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

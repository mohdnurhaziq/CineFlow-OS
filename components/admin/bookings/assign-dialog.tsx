"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useDialog } from "@/lib/use-dialog";
import { cn } from "@/lib/utils";
import type { AssignableMember } from "@/lib/team/members";

interface AssignDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Who can be picked: the owner and active team members. */
  people: AssignableMember[];
  /** People to leave out (already on the booking). */
  excludeIds?: string[];
  title: string;
  description?: string;
  /** Called with the chosen person; resolves with an error message to show, or null when it worked. */
  onAssign: (userId: string) => Promise<string | null>;
}

/** Pick ONE person from the studio's team. Used for one booking (Booking Details) and for several (the list). */
export function AssignDialog({ isOpen, onClose, people, excludeIds = [], title, description, onAssign }: AssignDialogProps) {
  const dialog = useDialog(isOpen, onClose);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setUserId("");
      setError(null);
      setBusy(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;
  const choices = people.filter((p) => !excludeIds.includes(p.id));

  const submit = async () => {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    const message = await onAssign(userId);
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        {...dialog}
        aria-labelledby="assign-dialog-title"
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#0d0d10] shadow-2xl p-5 space-y-4"
      >
        <div className="space-y-1">
          <h2 id="assign-dialog-title" className="flex items-center gap-2 text-base font-bold text-white tracking-tight">
            <UserPlus className="size-4 text-amber-400" aria-hidden="true" />
            {title}
          </h2>
          {description && <p className="text-xs text-zinc-400">{description}</p>}
        </div>

        {choices.length === 0 ? (
          <p className="text-xs text-zinc-400">No one else on your team can be added right now.</p>
        ) : (
          <fieldset className="space-y-1.5 max-h-64 overflow-y-auto">
            <legend className="sr-only">Team member</legend>
            {choices.map((p) => (
              <label
                key={p.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors",
                  userId === p.id ? "border-amber-500/60 bg-amber-500/10" : "border-zinc-800 hover:bg-zinc-900/60"
                )}
              >
                <input
                  type="radio"
                  name="assignee"
                  value={p.id}
                  checked={userId === p.id}
                  onChange={() => setUserId(p.id)}
                  className="accent-amber-500"
                />
                <span className="min-w-0">
                  <span className="block text-zinc-100 truncate">{p.name}</span>
                  <span className="block text-[11px] text-zinc-400 truncate">{p.roleName}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={buttonVariants({ variant: "secondary" })}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!userId || busy} className={buttonVariants()}>
            {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}

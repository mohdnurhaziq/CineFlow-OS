"use client";

import { useState } from "react";
import { Plus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { assignTeamMember, unassignTeamMember } from "@/lib/actions/admin-assignments";
import { emailNote } from "@/components/admin/bookings/assign-email-note";
import type { BookingDetails } from "@/lib/bookings/details";
import type { AssignableMember } from "@/lib/team/members";
import { AssignDialog } from "./assign-dialog";

export interface BookingTeamControls {
  tenantId: string;
  tenantSlug: string;
  /** Bookings MANAGE: add and remove. Without it the section is read-only. */
  canManage: boolean;
  /** Who can be added. */
  people: AssignableMember[];
  onChanged: () => void;
}

/** Who is on this booking, with Add and remove for people who can manage bookings. */
export function BookingTeamSection({ booking, controls }: { booking: BookingDetails; controls?: BookingTeamControls }) {
  const { confirm, confirmDialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const canEdit = !!controls?.canManage;

  const remove = async (a: BookingDetails["assignees"][number]) => {
    if (!controls) return;
    const ok = await confirm({
      title: `Remove ${a.name}?`,
      message: `Remove ${a.name} from this booking? They'll be emailed.`,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setRemoving(a.id);
    const res = await unassignTeamMember({
      tenantId: controls.tenantId,
      tenantSlug: controls.tenantSlug,
      bookingId: booking.id,
      userId: a.id,
    });
    setRemoving(null);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success(`${a.name} removed from this booking.${emailNote(res.emailDelivery)}`);
    controls.onChanged();
  };

  return (
    <section className="space-y-2" aria-label="Team">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          <Users className="size-3.5" />
          Team
        </h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:underline"
          >
            <Plus className="size-3" aria-hidden="true" />
            Add
          </button>
        )}
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/70">
        {booking.assignees.length === 0 ? (
          <p className="px-3.5 py-2.5 text-xs text-zinc-500">No one assigned yet.</p>
        ) : (
          booking.assignees.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
              <span className="min-w-0">
                <span className="block text-zinc-200 truncate">{a.name}</span>
                <span className="block text-[11px] text-zinc-500 truncate">{a.roleName}</span>
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(a)}
                  disabled={removing === a.id}
                  aria-label={`Remove ${a.name}`}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {controls && (
        <AssignDialog
          isOpen={adding}
          onClose={() => setAdding(false)}
          people={controls.people}
          excludeIds={booking.assignees.map((a) => a.id)}
          title="Add to this booking"
          description="They'll be emailed the details."
          onAssign={async (userId) => {
            const res = await assignTeamMember({
              tenantId: controls.tenantId,
              tenantSlug: controls.tenantSlug,
              bookingIds: [booking.id],
              userId,
            });
            if (!res.success) return res.message;
            const who = controls.people.find((p) => p.id === userId)?.name ?? "They";
            toast.success(
              res.assigned > 0
                ? `${who} assigned.${emailNote(res.emailDelivery)}`
                : `${who} was already on this booking.`
            );
            setAdding(false);
            controls.onChanged();
            return null;
          }}
        />
      )}
      {confirmDialog}
    </section>
  );
}

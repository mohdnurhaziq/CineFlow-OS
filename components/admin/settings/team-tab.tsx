"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { deleteTeamRole, removeTeamMember, resendTeamInvite, restoreTeamMember } from "@/lib/actions/admin-team";
import { errorMessageOf } from "@/lib/action-error";
import { ACCESS_AREAS, ACCESS_TICKS, NO_ACCESS, levelAtLeast, type AccessMap } from "@/lib/auth/access";
import { AREA_LABELS, LEVEL_LABELS, TICK_LABELS } from "@/lib/team/access-labels";
import { TEAM_MEMBER_STATUS_LABELS, type TeamMemberStatus } from "@/lib/team/status";
import { SettingsSection } from "./settings-ui";
import { TeamRoleDialog, type TeamRoleRow } from "./team-role-dialog";
import { InviteLinkDialog, TeamMemberDialog, type InviteSent, type TeamMemberRow } from "./team-member-dialog";

function summary(role: TeamRoleRow): string {
  const parts = ACCESS_AREAS.filter((a) => role.access.areas[a] !== "NONE").map((a) => `${AREA_LABELS[a]}: ${LEVEL_LABELS[role.access.areas[a]]}`);
  return parts.length ? parts.join(" · ") : "No access to anything yet";
}

/** What a person's extras add on top of their role, e.g. ["Bookings & Calendar", "Set prices"]. */
function extrasAdded(role: AccessMap | undefined, extra: AccessMap | null): string[] {
  if (!extra) return [];
  const base = role ?? NO_ACCESS;
  return [
    ...ACCESS_AREAS.filter((a) => !levelAtLeast(base.areas[a], extra.areas[a])).map((a) => AREA_LABELS[a]),
    ...ACCESS_TICKS.filter((t) => extra.ticks[t] && !base.ticks[t]).map((t) => TICK_LABELS[t].title),
  ];
}

const STATUS_CLASS: Record<TeamMemberStatus, string> = {
  ACTIVE: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  INVITED: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  LINK_EXPIRED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  REMOVED: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
};

const actionCls = "px-2.5 py-1.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-40";

/** Team tab: who is on the team, and the studio's roles and what each may do. */
export function TeamTab({ tenant, roles, members }: { tenant: { id: string; slug: string }; roles: TeamRoleRow[]; members: TeamMemberRow[] }) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [editing, setEditing] = useState<TeamRoleRow | "new" | null>(null);
  const [editingMember, setEditingMember] = useState<TeamMemberRow | "new" | null>(null);
  const [linkSent, setLinkSent] = useState<InviteSent | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const ids = { tenantId: tenant.id, tenantSlug: tenant.slug };

  /** Runs a member action, reporting a refusal; returns the successful result or null. */
  async function run<T extends { success: boolean; message?: string }>(memberId: string, fallback: string, call: () => Promise<T>) {
    setBusy(memberId);
    try {
      const res = await call();
      if (!res.success) {
        toast.error(res.message || fallback);
        return null;
      }
      return res;
    } catch (err) {
      toast.error(errorMessageOf(err) || fallback);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function resend(m: TeamMemberRow) {
    const res = await run(m.id, "Could not send a new link.", () => resendTeamInvite({ ...ids, userId: m.id }));
    if (!res?.success) return;
    setLinkSent({ name: m.name, email: m.email, inviteUrl: res.inviteUrl, emailDelivery: res.emailDelivery });
    router.refresh();
  }

  async function removeMember(m: TeamMemberRow) {
    const ok = await confirm({
      title: `Remove ${m.name}?`,
      message:
        "They can't sign in any more and are signed out now. Their name stays on past work. Upcoming bookings assigned to them become unassigned. You can bring them back later.",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    const res = await run(m.id, "Could not remove them.", () => removeTeamMember({ ...ids, userId: m.id }));
    if (!res?.success) return;
    toast.success(
      res.unassigned > 0
        ? `${m.name} was removed. ${res.unassigned} upcoming ${res.unassigned === 1 ? "booking is" : "bookings are"} now unassigned.`
        : `${m.name} was removed. No upcoming bookings were assigned to them.`
    );
    router.refresh();
  }

  async function bringBack(m: TeamMemberRow) {
    const res = await run(m.id, "Could not bring them back.", () => restoreTeamMember({ ...ids, userId: m.id }));
    if (!res) return;
    toast.success(`${m.name} can sign in again. Their old bookings aren't reassigned.`);
    router.refresh();
  }

  function roleLine(m: TeamMemberRow): string {
    if (m.isOwner) return "Studio owner";
    const added = extrasAdded(roles.find((r) => r.id === m.roleId)?.access, m.extraAccess);
    return added.length ? `${m.roleName} + ${added.join(", ")}` : m.roleName;
  }

  async function remove(role: TeamRoleRow) {
    if (!(await confirm({ title: `Delete ${role.name}?`, message: "People can no longer be given this role.", confirmLabel: "Delete" }))) return;
    try {
      const res = await deleteTeamRole({ tenantId: tenant.id, tenantSlug: tenant.slug, roleId: role.id });
      if (!res.success) {
        toast.error(res.message || "Could not delete the role.");
        return;
      }
      toast.success("Role deleted.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessageOf(err) || "Could not delete the role.");
    }
  }

  const deleteBlock = (role: TeamRoleRow): string | undefined =>
    role.members > 0 ? "Move its people to another role first." : roles.length <= 1 ? "A studio needs at least one role." : undefined;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0b0b0e] px-4 sm:px-6 pb-2">
      <SettingsSection title="Members" description="Everyone who can sign in to this studio's admin. Invite people by email; they set their own password.">
        <ul className="space-y-3">
          {members.map((m) => (
            <li key={m.id} className="rounded-xl border border-zinc-800 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 sm:mr-auto">
                <p className="text-sm font-semibold text-white flex flex-wrap items-center gap-2">
                  <span className={m.status === "REMOVED" ? "text-zinc-400" : undefined}>{m.name}</span>
                  {!m.isOwner && (
                    <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_CLASS[m.status]}`}>{TEAM_MEMBER_STATUS_LABELS[m.status]}</span>
                  )}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5 break-all">{m.email}</p>
                <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{roleLine(m)}</p>
              </div>
              {!m.isOwner && (
                <div className="flex flex-wrap gap-1 -ml-2.5 sm:ml-0">
                  {m.status === "REMOVED" ? (
                    <button type="button" disabled={busy === m.id} onClick={() => void bringBack(m)} className={actionCls}>
                      Bring back
                    </button>
                  ) : (
                    <>
                      {(m.status === "INVITED" || m.status === "LINK_EXPIRED") && (
                        <button type="button" disabled={busy === m.id} onClick={() => void resend(m)} className={actionCls}>
                          Resend link
                        </button>
                      )}
                      <button type="button" disabled={busy === m.id} onClick={() => setEditingMember(m)} className={actionCls} aria-label={`Edit ${m.name}`}>
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy === m.id}
                        onClick={() => void removeMember(m)}
                        className={`${actionCls} hover:text-red-400`}
                        aria-label={`Remove ${m.name}`}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setEditingMember("new")}
          disabled={roles.length === 0}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm text-zinc-200 border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40"
        >
          <UserPlus className="size-4" /> Invite team member
        </button>
      </SettingsSection>

      <SettingsSection title="Roles" description="A role is a set of access you give to people. Changes apply right away, with no need to sign out and in.">
        {roles.length === 0 && <p className="text-sm text-zinc-400">No roles yet.</p>}
        <ul className="space-y-3">
          {roles.map((role) => (
            <li key={role.id} className="rounded-xl border border-zinc-800 p-4 flex items-start gap-3">
              <div className="min-w-0 mr-auto">
                <p className="text-sm font-semibold text-white">
                  {role.name}{" "}
                  <span className="font-normal text-zinc-400">
                    · {role.members} {role.members === 1 ? "person" : "people"}
                  </span>
                </p>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{summary(role)}</p>
              </div>
              <button type="button" onClick={() => setEditing(role)} aria-label={`Edit ${role.name}`} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => void remove(role)}
                disabled={!!deleteBlock(role)}
                title={deleteBlock(role)}
                aria-label={`Delete ${role.name}`}
                className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm text-zinc-200 border border-zinc-700 hover:bg-zinc-800">
          <Plus className="size-4" /> New role
        </button>
      </SettingsSection>

      {editing && (
        <TeamRoleDialog
          key={editing === "new" ? "new" : editing.id}
          tenant={tenant}
          role={editing === "new" ? null : editing}
          start={NO_ACCESS}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {editingMember && (
        <TeamMemberDialog
          key={editingMember === "new" ? "new" : editingMember.id}
          tenant={tenant}
          roles={roles}
          member={editingMember === "new" ? null : editingMember}
          onClose={() => setEditingMember(null)}
          onChanged={() => router.refresh()}
        />
      )}
      {linkSent && <InviteLinkDialog sent={linkSent} onClose={() => setLinkSent(null)} />}
      {confirmDialog}
    </div>
  );
}

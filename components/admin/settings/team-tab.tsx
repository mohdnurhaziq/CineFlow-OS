"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { deleteTeamRole } from "@/lib/actions/admin-team";
import { errorMessageOf } from "@/lib/action-error";
import { ACCESS_AREAS, NO_ACCESS } from "@/lib/auth/access";
import { AREA_LABELS, LEVEL_LABELS } from "@/lib/team/access-labels";
import { SettingsSection } from "./settings-ui";
import { TeamRoleDialog, type TeamRoleRow } from "./team-role-dialog";

function summary(role: TeamRoleRow): string {
  const parts = ACCESS_AREAS.filter((a) => role.access.areas[a] !== "NONE").map((a) => `${AREA_LABELS[a]}: ${LEVEL_LABELS[role.access.areas[a]]}`);
  return parts.length ? parts.join(" · ") : "No access to anything yet";
}

/** Team tab: the studio's roles and what each may do. (Members come next.) */
export function TeamTab({ tenant, roles }: { tenant: { id: string; slug: string }; roles: TeamRoleRow[] }) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [editing, setEditing] = useState<TeamRoleRow | "new" | null>(null);

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

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0b0b0e] px-4 sm:px-6 pb-2">
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
              <button type="button" onClick={() => void remove(role)} aria-label={`Delete ${role.name}`} className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800">
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
      {confirmDialog}
    </div>
  );
}

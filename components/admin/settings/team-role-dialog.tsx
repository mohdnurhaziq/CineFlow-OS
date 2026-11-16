"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { useDialog } from "@/lib/use-dialog";
import { createTeamRole, updateTeamRole } from "@/lib/actions/admin-team";
import { errorMessageOf } from "@/lib/action-error";
import type { AccessMap } from "@/lib/auth/access";
import { AccessEditor } from "./access-editor";
import { inputCls, labelCls } from "./settings-ui";

export interface TeamRoleRow {
  id: string;
  name: string;
  access: AccessMap;
  members: number;
}

/** Create a role, or edit one (pass `role`). Says how many people an edit changes before it is saved. */
export function TeamRoleDialog({
  tenant,
  role,
  start,
  onClose,
  onSaved,
}: {
  tenant: { id: string; slug: string };
  role: TeamRoleRow | null;
  start: AccessMap;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useDialog(true, onClose);
  const [name, setName] = useState(role?.name ?? "");
  const [access, setAccess] = useState<AccessMap>(role?.access ?? start);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const base = { tenantId: tenant.id, tenantSlug: tenant.slug, name, access };
      const res = role ? await updateTeamRole({ ...base, roleId: role.id }) : await createTeamRole(base);
      if (!res.success) {
        toast.error(res.message || "Could not save the role.");
        return;
      }
      toast.success(role ? "Role saved. Changes apply right away." : "Role created.");
      onSaved();
    } catch (err) {
      toast.error(errorMessageOf(err) || "Could not save the role.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        {...dialog}
        aria-labelledby="team-role-title"
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#121215] p-5 sm:p-6 shadow-2xl"
      >
      <form onSubmit={submit} className="space-y-5">
        <h2 id="team-role-title" className="text-base font-semibold text-white">
          {role ? `Edit ${role.name}` : "New role"}
        </h2>
        <div>
          <label htmlFor="team-role-name" className={labelCls}>
            Role name
          </label>
          <input id="team-role-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Editor" className={inputCls} autoFocus />
        </div>
        <AccessEditor value={access} onChange={setAccess} idPrefix="role" />
        {role && role.members > 0 && (
          <p className="text-sm text-amber-300" role="status">
            This changes access for {role.members} {role.members === 1 ? "person" : "people"}.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonVariants({ variant: "secondary" })}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !name.trim()} className={buttonVariants()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Saving…" : role ? "Save role" : "Create role"}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}

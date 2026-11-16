"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { useDialog } from "@/lib/use-dialog";
import { inviteTeamMember, updateTeamMember } from "@/lib/actions/admin-team";
import { errorMessageOf } from "@/lib/action-error";
import { NO_ACCESS, type AccessMap } from "@/lib/auth/access";
import type { TeamMemberRow } from "@/lib/team/members";
import { CopyButton } from "@/components/admin/print-orders/copy-button";
import { AccessEditor } from "./access-editor";
import { helpCls, inputCls, labelCls } from "./settings-ui";
import type { TeamRoleRow } from "./team-role-dialog";

export type { TeamMemberRow };

export interface InviteSent {
  name: string;
  email: string;
  inviteUrl: string;
  emailDelivery: "SENT" | "SKIPPED" | "FAILED";
}

function ModalShell({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: React.ReactNode }) {
  const dialog = useDialog(true, onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        {...dialog}
        aria-labelledby={labelledBy}
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#121215] p-5 sm:p-6 shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}

/** The set-password link to copy, and what happened to the email. */
function InviteLinkPanel({ sent, onDone }: { sent: InviteSent; onDone: () => void }) {
  const emailed = sent.emailDelivery === "SENT";
  return (
    <div className="space-y-5">
      <h2 id="team-invite-link-title" className="text-base font-semibold text-white">
        Link for {sent.name}
      </h2>
      <p role="status" className={`flex gap-2.5 text-sm ${emailed ? "text-emerald-300" : "text-amber-300"}`}>
        {emailed ? <CheckCircle2 className="size-4 mt-0.5 shrink-0" aria-hidden="true" /> : <MailWarning className="size-4 mt-0.5 shrink-0" aria-hidden="true" />}
        <span>
          {emailed
            ? `We emailed ${sent.email} a link to set their password.`
            : sent.emailDelivery === "SKIPPED"
              ? `Email isn't set up, so nothing was sent. Copy the link and send it to ${sent.name} yourself, for example on WhatsApp.`
              : `The email to ${sent.email} couldn't be sent. Copy the link and send it to ${sent.name} yourself, for example on WhatsApp.`}
        </span>
      </p>
      <div>
        <label htmlFor="team-invite-link" className={labelCls}>
          Set-password link
        </label>
        <div className="flex gap-2">
          <input id="team-invite-link" readOnly value={sent.inviteUrl} onFocus={(e) => e.currentTarget.select()} className={`${inputCls} font-mono text-xs`} />
          <CopyButton text={sent.inviteUrl} />
        </div>
        <p className={helpCls}>This link works for 30 days and only once. Anyone with it can set the password, so send it only to {sent.name}.</p>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onDone} className={buttonVariants()}>
          Done
        </button>
      </div>
    </div>
  );
}

/** Shows a freshly issued link (after "Resend link"). */
export function InviteLinkDialog({ sent, onClose }: { sent: InviteSent; onClose: () => void }) {
  return (
    <ModalShell labelledBy="team-invite-link-title" onClose={onClose}>
      <InviteLinkPanel sent={sent} onDone={onClose} />
    </ModalShell>
  );
}

/**
 * Invite someone (no `member`) or edit a member's name, role and extras. After an invite it shows
 * the set-password link to copy and whether the email went out.
 */
export function TeamMemberDialog({
  tenant,
  roles,
  member,
  onClose,
  onChanged,
}: {
  tenant: { id: string; slug: string };
  roles: TeamRoleRow[];
  member: TeamMemberRow | null;
  onClose: () => void;
  /** Called after a save, so the list can refresh. */
  onChanged: () => void;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(member?.roleId ?? roles[0]?.id ?? "");
  const [extrasOn, setExtrasOn] = useState(!!member?.extraAccess);
  const [extras, setExtras] = useState<AccessMap>(member?.extraAccess ?? NO_ACCESS);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState<InviteSent | null>(null);

  const role = roles.find((r) => r.id === roleId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!roleId) {
      toast.error("Pick a role.");
      return;
    }
    setSaving(true);
    try {
      const extraAccess = extrasOn ? extras : null;
      const ids = { tenantId: tenant.id, tenantSlug: tenant.slug };
      if (member) {
        const res = await updateTeamMember({ ...ids, userId: member.id, name, roleId, extraAccess });
        if (!res.success) {
          toast.error(res.message || "Could not save.");
          return;
        }
        toast.success("Saved. It applies from their next page.");
        onChanged();
        onClose();
        return;
      }
      const res = await inviteTeamMember({ ...ids, name, email, roleId, extraAccess });
      if (!res.success) {
        toast.error(res.message || "Could not invite them.");
        return;
      }
      setSent({ name: name.trim(), email: email.trim().toLowerCase(), inviteUrl: res.inviteUrl, emailDelivery: res.emailDelivery });
      onChanged();
    } catch (err) {
      toast.error(errorMessageOf(err) || "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <ModalShell labelledBy="team-invite-link-title" onClose={onClose}>
        <InviteLinkPanel sent={sent} onDone={onClose} />
      </ModalShell>
    );
  }

  return (
    <ModalShell labelledBy="team-member-title" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <h2 id="team-member-title" className="text-base font-semibold text-white">
          {member ? `Edit ${member.name}` : "Invite team member"}
        </h2>
        <div>
          <label htmlFor="team-member-name" className={labelCls}>
            Name
          </label>
          <input id="team-member-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputCls} autoFocus autoComplete="off" />
        </div>
        {member ? (
          <div>
            <p className={labelCls}>Email</p>
            <p className="text-sm text-zinc-300 break-all">{member.email}</p>
          </div>
        ) : (
          <div>
            <label htmlFor="team-member-email" className={labelCls}>
              Email
            </label>
            <input
              id="team-member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              className={inputCls}
              autoComplete="off"
            />
            <p className={helpCls}>We email them a link to set their password. You can also copy the link afterwards.</p>
          </div>
        )}
        <div>
          <label htmlFor="team-member-role" className={labelCls}>
            Role
          </label>
          <select id="team-member-role" value={roleId} onChange={(e) => setRoleId(e.target.value)} className={inputCls}>
            {!roleId && <option value="">Pick a role</option>}
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-4">
          <label className="flex gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1 accent-amber-500" checked={extrasOn} onChange={(e) => setExtrasOn(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium text-white">Extra access for this person</span>
              <span className="block text-xs text-zinc-400 mt-0.5 leading-relaxed">
                On top of {role ? role.name : "their role"}. Only higher levels are offered; what the role already gives stays.
              </span>
            </span>
          </label>
          {extrasOn && <AccessEditor value={extras} onChange={setExtras} baseline={role?.access ?? NO_ACCESS} idPrefix="extra" />}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonVariants({ variant: "secondary" })}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !name.trim() || !roleId || (!member && !email.trim())} className={buttonVariants()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? (member ? "Saving…" : "Inviting…") : member ? "Save" : "Invite"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

"use client";

import { useState } from "react";
import { Inbox, Mail, Phone } from "lucide-react";
import { approveInviteRequest, cancelInvite, createInviteLink, rejectInviteRequest, type InviteDecision, type InviteRequestRow } from "@/lib/actions/invite-requests";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatStudioDate, formatStudioDateTime } from "@/lib/slot-time";

const KIND: Record<string, string> = { PHOTO: "Photo", VIDEO: "Video", BOTH: "Photo and video" };

const STATUS: Record<InviteRequestRow["status"], { label: string; chip: string }> = {
  PENDING: { label: "Pending", chip: "bg-amber-500/10 text-amber-300 border-amber-500/40" },
  APPROVED: { label: "Approved", chip: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  EXPIRED: { label: "Expired", chip: "bg-zinc-800 text-zinc-300 border-zinc-700" },
  REJECTED: { label: "Rejected", chip: "bg-red-500/10 text-red-300 border-red-500/30" },
  JOINED: { label: "Joined", chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
};
/** Waiting for a decision first, then invites still out, then the finished ones. */
const ORDER: InviteRequestRow["status"][] = ["PENDING", "APPROVED", "EXPIRED", "JOINED", "REJECTED"];

const button = "inline-flex min-h-11 items-center justify-center rounded-lg px-3.5 text-xs font-semibold disabled:opacity-50";
const quiet = `${button} border border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700`;
const primary = `${button} bg-amber-500 text-black hover:bg-amber-400`;

/** What happened on one card, kept there: a sentence, and a link when there is one to send by hand. */
type Notice = { text: string; bad?: boolean; link?: string };

/** People who asked for an invite on the landing page: approve or reject them here. */
export function InviteRequestsPanel({ invites: initial }: { invites: InviteRequestRow[] }) {
  // Kept locally and updated right after each decision, so the list needs no page refresh.
  const [invites, setInvites] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, Notice>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const waiting = invites.filter((i) => i.status === "PENDING").length;
  const ordered = [...invites].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  const update = (id: string, change: Partial<InviteRequestRow>) => setInvites((rows) => rows.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const run = async (i: InviteRequestRow, action: () => Promise<InviteDecision>, done: (res: InviteDecision) => Notice) => {
    setBusyId(i.id);
    setCopiedId(null);
    setNotices(({ [i.id]: _gone, ...rest }) => rest);
    try {
      const res = await action();
      setNotices((all) => ({ ...all, [i.id]: res.success ? done(res) : { text: res.message ?? "That didn't work. Try again.", bad: true } }));
    } catch {
      setNotices((all) => ({ ...all, [i.id]: { text: "Couldn't reach the server. Try again.", bad: true } }));
    } finally {
      setBusyId(null);
    }
  };

  const inTwoWeeks = () => new Date(Date.now() + 14 * 86_400_000).toISOString();

  const approve = (i: InviteRequestRow) =>
    run(
      i,
      () => approveInviteRequest({ id: i.id }),
      (res) => {
        update(i.id, { status: "APPROVED", inviteExpiresAt: inTwoWeeks() });
        return res.emailed
          ? { text: `Approved. The invite was emailed to ${i.email}.` }
          : { text: "Approved, but the email couldn't be sent. Copy this link and send it yourself.", bad: true, link: res.link };
      }
    );

  const copyLink = async (i: InviteRequestRow) => {
    if (!(await confirm({ title: "Make a new link to send yourself?", message: "The link in their email will stop working.", confirmLabel: "Make a new link", destructive: false }))) return;
    await run(
      i,
      () => createInviteLink({ id: i.id }),
      (res) => {
        update(i.id, { status: "APPROVED", inviteExpiresAt: inTwoWeeks() });
        return { text: "Send this link to them. It works once, only with their email.", link: res.link };
      }
    );
  };

  const cancel = async (i: InviteRequestRow) => {
    if (!(await confirm({ title: `Cancel ${i.name}'s invite?`, message: "Their link will stop working. The request goes back to pending.", confirmLabel: "Cancel invite" }))) return;
    await run(
      i,
      () => cancelInvite({ id: i.id }),
      () => {
        update(i.id, { status: "PENDING", inviteExpiresAt: null });
        return { text: "Invite cancelled." };
      }
    );
  };

  const reject = async (i: InviteRequestRow) => {
    setRejectingId(null);
    await run(
      i,
      () => rejectInviteRequest({ id: i.id, notify }),
      (res) => {
        update(i.id, { status: "REJECTED", inviteExpiresAt: null });
        if (!notify) return { text: "Rejected. No email was sent." };
        return res.emailed ? { text: `Rejected, and ${i.email} was told by email.` } : { text: "Rejected, but the email couldn't be sent.", bad: true };
      }
    );
  };

  const copy = async (id: string, link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
    } catch {
      // Without clipboard access the link stays selectable in the box.
    }
  };

  return (
    <section aria-labelledby="invites-h" className="space-y-4">
      {confirmDialog}
      <div className="flex items-center gap-3">
        <Inbox className="size-5 text-amber-400" aria-hidden="true" />
        <h2 id="invites-h" className="text-lg font-bold text-white tracking-tight">
          Invite requests
        </h2>
        <span className="text-xs font-mono text-zinc-400">{`${waiting} waiting`}</span>
      </div>

      {invites.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-[#121215] px-4 py-8 text-center text-sm text-zinc-400">No invite requests yet.</p>
      ) : (
        <ul className="space-y-3">
          {ordered.map((i) => {
            const notice = notices[i.id];
            const busy = busyId === i.id;
            return (
              <li key={i.id} className="rounded-xl border border-zinc-800 bg-[#121215] p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{i.studioName}</div>
                    <div className="text-xs text-zinc-400">
                      {i.name} · {KIND[i.kind] ?? i.kind} · {formatStudioDateTime(i.createdAt)}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wider ${STATUS[i.status].chip}`}>
                    {STATUS[i.status].label}
                  </span>
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
                {i.status === "PENDING" && i.handledAt && <p className="text-xs text-zinc-400">Marked handled earlier, on {formatStudioDate(i.handledAt)}.</p>}
                {i.status === "APPROVED" && i.inviteExpiresAt && <p className="text-xs text-zinc-400">Waiting for them to sign up. The invite expires {formatStudioDate(i.inviteExpiresAt)}.</p>}
                {i.status === "JOINED" && i.joinedTenantSlug && (
                  <p className="text-xs text-zinc-400">
                    Their studio: <span className="font-mono text-white">{i.joinedTenantSlug}</span>
                  </p>
                )}

                {notice && (
                  <div role="status" className={`space-y-2 rounded-lg border p-3 text-xs ${notice.bad ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-zinc-700 bg-zinc-900 text-zinc-200"}`}>
                    <p>{notice.text}</p>
                    {notice.link && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          readOnly
                          value={notice.link}
                          aria-label={`Invite link for ${i.name}`}
                          onFocus={(e) => e.target.select()}
                          className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-black px-3 font-mono text-xs text-white"
                        />
                        <button type="button" onClick={() => copy(i.id, notice.link!)} className={quiet}>
                          {copiedId === i.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {rejectingId === i.id ? (
                  <div className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                    <p className="text-sm text-white">Reject {i.name}&apos;s request?</p>
                    <label className="flex min-h-11 items-center gap-2.5 text-xs text-zinc-300">
                      <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-amber-500" />
                      Email them a short note that we can&apos;t offer a place right now
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={() => reject(i)} className={`${button} bg-red-600 text-white hover:bg-red-500`}>
                        Reject request
                      </button>
                      <button type="button" onClick={() => setRejectingId(null)} className={quiet}>
                        Keep it
                      </button>
                    </div>
                  </div>
                ) : (
                  i.status !== "JOINED" && (
                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                      {(i.status === "PENDING" || i.status === "EXPIRED") && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setNotify(true);
                            setRejectingId(i.id);
                          }}
                          className={quiet}
                        >
                          Reject
                        </button>
                      )}
                      {i.status !== "APPROVED" && (
                        <button type="button" disabled={busy} onClick={() => approve(i)} className={primary}>
                          {busy ? "Working…" : i.status === "EXPIRED" ? "Approve again" : "Approve"}
                        </button>
                      )}
                      {i.status === "APPROVED" && (
                        <>
                          <button type="button" disabled={busy} onClick={() => approve(i)} className={quiet}>
                            Resend email
                          </button>
                          <button type="button" disabled={busy} onClick={() => copyLink(i)} className={quiet}>
                            Copy link
                          </button>
                          <button type="button" disabled={busy} onClick={() => cancel(i)} className={quiet}>
                            Cancel invite
                          </button>
                        </>
                      )}
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

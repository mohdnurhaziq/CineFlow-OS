"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { requestIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { sendNotification } from "@/lib/notifications";
import { appUrl } from "@/lib/domain-name";
import { actionErrorMessage } from "@/lib/action-error";
import { INVITE_DAYS, hashInviteToken, inviteUrl, newInviteToken } from "@/lib/invites";
import { formatStudioDate } from "@/lib/slot-time";

/**
 * "Request an invite" from the public landing page. No sign-in; the platform owner reads the requests in
 * the super-admin console and is emailed when one arrives. The request is saved before any email is tried.
 * There the super-admin approves it (a personal invite link, lib/invites.ts) or rejects it.
 */

const DAY_MS = 86_400_000;
/** Invite-request emails the platform sends in an hour, across all visitors. */
const MAX_EMAILS_PER_HOUR = 20;
const KINDS = { PHOTO: "photo", VIDEO: "video", BOTH: "photo and video" } as const;

const RequestSchema = z.object({
  name: z.string().trim().min(1, "Please tell us your name.").max(100, "That name is too long."),
  studioName: z.string().trim().min(1, "Please tell us your studio's name.").max(100, "That studio name is too long."),
  email: z.string().trim().toLowerCase().email("Please enter a valid email.").max(200),
  phone: z.string().trim().max(30, "That phone number is too long.").optional(),
  kind: z.enum(["PHOTO", "VIDEO", "BOTH"], { message: "Please choose what you shoot." }),
  message: z.string().trim().max(1000, "Please keep your message under 1,000 characters.").optional(),
  /** Hidden field: people leave it empty, bots fill it in. */
  website: z.string().optional(),
});

type Fail = { success: false; error: "INVALID" | "RATE_LIMITED" | "FAILED"; message: string };

export async function requestInvite(input: z.input<typeof RequestSchema>): Promise<{ success: true } | Fail> {
  try {
    const parsed = RequestSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID", message: parsed.error.issues[0]?.message ?? "Please check the form." };
    }
    const v = parsed.data;
    if (v.website?.trim()) return { success: true }; // a bot: look like it worked, save nothing

    const ip = await requestIp();
    if (ip && isRateLimited(`invite:${ip}`, 5)) {
      return { success: false, error: "RATE_LIMITED", message: "Too many requests. Please try again in a few minutes." };
    }

    const recent = await db.inviteRequest.findFirst({
      where: { email: v.email, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
      select: { id: true },
    });
    if (recent) return { success: true }; // already asked today: no second row, no second email

    const row = await db.inviteRequest.create({
      data: { name: v.name, studioName: v.studioName, email: v.email, phone: v.phone || null, kind: v.kind, message: v.message || null },
    });

    // However many addresses the requests come from, only so many emails go out an hour, so a flood can't
    // use up the platform's mail quota (booking confirmations and password resets share it). The request
    // is saved either way and shows in the console.
    if (isRateLimited("invite:all", MAX_EMAILS_PER_HOUR, 60 * 60 * 1000)) return { success: true };

    // Tell every active super-admin. Each send is on its own; a failure is logged and never loses the request.
    const admins = await db.user.findMany({ where: { role: "SUPER_ADMIN", deactivatedAt: null }, select: { name: true, email: true } });
    for (const admin of admins) {
      try {
        const res = await sendNotification(
          {
            event: "STUDIO_UPDATE",
            studioName: "CineFlow OS",
            studioSlug: "",
            clientName: admin.name,
            clientEmail: admin.email,
            headline: `New invite request: ${row.studioName}`,
            message: `${row.name} (${row.email}${row.phone ? `, ${row.phone}` : ""}) runs ${row.studioName}, a ${KINDS[v.kind]} studio.${row.message ? ` They wrote: ${row.message}` : ""}`,
            linkUrl: new URL("/super-admin", appUrl()).href, // an email needs the full address
            linkLabel: "Open invite requests",
          },
          "EMAIL"
        );
        if (res.emailDelivery === "FAILED") console.error("Invite request email failed:", res.emailError);
      } catch (err) {
        console.error("Invite request email failed:", err);
      }
    }
    return { success: true };
  } catch (err) {
    console.error("Invite request failed:", err);
    return { success: false, error: "FAILED", message: actionErrorMessage(err, "Something went wrong. Please try again.") };
  }
}

/** What the visitor typed, handed back with an error so the form can show it again instead of coming back empty. */
export type InviteFormValues = { name: string; studioName: string; email: string; phone: string; kind: string; message: string };

export type InviteFormState = { status: "idle" } | { status: "done" } | { status: "error"; message: string; values: InviteFormValues };

/** The landing page's form posts here (a React form action), so it also works before the page's JavaScript loads. */
export async function submitInviteRequest(_previous: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const text = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
  };
  const values: InviteFormValues = {
    name: text("name"),
    studioName: text("studioName"),
    email: text("email"),
    phone: text("phone"),
    kind: text("kind"),
    message: text("message"),
  };
  const res = await requestInvite({
    name: text("name"),
    studioName: text("studioName"),
    email: text("email"),
    phone: text("phone") || undefined,
    kind: text("kind") as "PHOTO" | "VIDEO" | "BOTH",
    message: text("message") || undefined,
    website: text("website"),
  });
  return res.success ? { status: "done" } : { status: "error", message: res.message, values };
}

export interface InviteRequestRow {
  id: string;
  name: string;
  studioName: string;
  email: string;
  phone: string | null;
  kind: string;
  message: string | null;
  createdAt: string;
  /** From before approving existed: when it was "marked handled". */
  handledAt: string | null;
  status: "PENDING" | "APPROVED" | "EXPIRED" | "REJECTED" | "JOINED";
  inviteExpiresAt: string | null;
  /** The studio they made with their invite. */
  joinedTenantSlug: string | null;
}

export async function listInviteRequests(): Promise<InviteRequestRow[]> {
  await requireSuperAdmin();
  const rows = await db.inviteRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const now = new Date();
  // Field by field: the invite's hash never leaves the server.
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    studioName: r.studioName,
    email: r.email,
    phone: r.phone,
    kind: r.kind,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
    handledAt: r.handledAt?.toISOString() ?? null,
    status: r.joinedAt
      ? "JOINED"
      : r.status === "APPROVED"
        ? r.inviteExpiresAt && r.inviteExpiresAt > now
          ? "APPROVED"
          : "EXPIRED"
        : r.status === "REJECTED"
          ? "REJECTED"
          : "PENDING",
    inviteExpiresAt: r.inviteExpiresAt?.toISOString() ?? null,
    joinedTenantSlug: r.joinedTenantSlug,
  }));
}

export interface InviteDecision {
  success: boolean;
  message?: string;
  /** For approve and reject: whether the person was emailed. */
  emailed?: boolean;
  /** An invite link to send by hand: only when asked for, or when the email couldn't go. */
  link?: string;
}

const IdSchema = z.object({ id: z.string().min(1) });
const JOINED = "They've already created their studio.";

/** The request a decision is about, refusing one that is gone or already used. */
async function undecided(id: string) {
  const row = await db.inviteRequest.findUnique({ where: { id } });
  if (!row) throw new Error("That request no longer exists.");
  if (row.joinedAt) throw new Error(JOINED);
  return row;
}

/** Writes `data` unless they joined in the meantime. */
async function change(id: string, data: Parameters<typeof db.inviteRequest.updateMany>[0]["data"]): Promise<void> {
  const done = await db.inviteRequest.updateMany({ where: { id, joinedAt: null }, data });
  if (done.count !== 1) throw new Error(JOINED);
}

/** A new link for the request, which ends any earlier one. */
async function issueInvite(id: string, byEmail: boolean): Promise<{ token: string; expires: Date }> {
  const token = newInviteToken();
  const expires = new Date(Date.now() + INVITE_DAYS * DAY_MS);
  await change(id, { status: "APPROVED", decidedAt: new Date(), inviteTokenHash: hashInviteToken(token), inviteExpiresAt: expires, invitedByEmail: byEmail });
  return { token, expires };
}

function refused(err: unknown): InviteDecision {
  return { success: false, message: actionErrorMessage(err, err instanceof Error ? err.message : "Could not update the request.") };
}

/** Approve (or resend): emails a fresh personal link. If the email can't go, hands back the link. */
export async function approveInviteRequest(input: { id: string }): Promise<InviteDecision> {
  try {
    await requireSuperAdmin();
    const { id } = IdSchema.parse(input);
    const row = await undecided(id);
    const { token, expires } = await issueInvite(id, true);
    const res = await sendNotification(
      {
        event: "STUDIO_INVITE",
        studioName: "CineFlow OS",
        studioSlug: "",
        clientName: row.name,
        clientEmail: row.email,
        requestedStudio: row.studioName,
        inviteUrl: inviteUrl(token),
        expiresOn: formatStudioDate(expires),
      },
      "EMAIL"
    );
    if (res.emailDelivery === "SENT") return { success: true, emailed: true };
    console.error(`Invite email not sent (${res.emailDelivery}): ${res.emailError ?? "no email provider configured"}`);
    // Sent by hand instead, so using it says nothing about who reads that inbox.
    await db.inviteRequest.updateMany({ where: { id, inviteTokenHash: hashInviteToken(token) }, data: { invitedByEmail: false } });
    return { success: true, emailed: false, link: inviteUrl(token) };
  } catch (err) {
    return refused(err);
  }
}

/** A new link for the super-admin to send by hand. The one emailed earlier stops working. */
export async function createInviteLink(input: { id: string }): Promise<InviteDecision> {
  try {
    await requireSuperAdmin();
    const { id } = IdSchema.parse(input);
    const row = await undecided(id);
    if (row.status !== "APPROVED") throw new Error("Approve the request first.");
    const { token } = await issueInvite(id, false);
    return { success: true, link: inviteUrl(token) };
  } catch (err) {
    return refused(err);
  }
}

/** Takes back an approval: the link stops working and the request waits again. */
export async function cancelInvite(input: { id: string }): Promise<InviteDecision> {
  try {
    await requireSuperAdmin();
    const { id } = IdSchema.parse(input);
    const row = await undecided(id);
    if (row.status !== "APPROVED") throw new Error("There is no invite to cancel.");
    await change(id, { status: "PENDING", decidedAt: null, inviteTokenHash: null, inviteExpiresAt: null, invitedByEmail: false });
    return { success: true };
  } catch (err) {
    return refused(err);
  }
}

/** Rejects, ending any invite, and with `notify` emails a short, polite note. */
export async function rejectInviteRequest(input: { id: string; notify: boolean }): Promise<InviteDecision> {
  try {
    await requireSuperAdmin();
    const { id, notify } = IdSchema.extend({ notify: z.boolean() }).parse(input);
    const row = await undecided(id);
    await change(id, { status: "REJECTED", decidedAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null, invitedByEmail: false });
    if (!notify) return { success: true, emailed: false };
    const res = await sendNotification(
      {
        event: "STUDIO_UPDATE",
        studioName: "CineFlow OS",
        studioSlug: "",
        clientName: row.name,
        clientEmail: row.email,
        headline: "About your invite request",
        message: `Thank you for your interest in CineFlow OS for ${row.studioName}. We can't offer you a place right now. You're welcome to ask again later.`,
      },
      "EMAIL"
    );
    return { success: true, emailed: res.emailDelivery === "SENT" };
  } catch (err) {
    return refused(err);
  }
}

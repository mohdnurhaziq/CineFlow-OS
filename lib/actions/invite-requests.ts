"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { requestIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { sendNotification } from "@/lib/notifications";
import { platformUrl } from "@/lib/domain-name";
import { actionErrorMessage } from "@/lib/action-error";

/**
 * "Request an invite" from the public landing page. No sign-in; the platform owner reads the requests in
 * the super-admin console and is emailed when one arrives. The request is saved before any email is tried.
 */

const DAY_MS = 86_400_000;
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
            linkUrl: platformUrl("/super-admin"),
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

export type InviteFormState = { status: "idle" } | { status: "done" } | { status: "error"; message: string };

/** The landing page's form posts here (a React form action), so it also works before the page's JavaScript loads. */
export async function submitInviteRequest(_previous: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const text = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
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
  return res.success ? { status: "done" } : { status: "error", message: res.message };
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
  handledAt: string | null;
}

export async function listInviteRequests(): Promise<InviteRequestRow[]> {
  await requireSuperAdmin();
  const rows = await db.inviteRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), handledAt: r.handledAt?.toISOString() ?? null }));
}

export async function setInviteRequestHandled(input: { id: string; handled: boolean }): Promise<{ success: boolean; message?: string }> {
  try {
    await requireSuperAdmin();
    const v = z.object({ id: z.string().min(1), handled: z.boolean() }).parse(input);
    await db.inviteRequest.update({ where: { id: v.id }, data: { handledAt: v.handled ? new Date() : null } });
    return { success: true };
  } catch (err) {
    return { success: false, message: actionErrorMessage(err, "Could not update the request.") };
  }
}

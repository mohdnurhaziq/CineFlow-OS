"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { requireOwner } from "@/lib/auth/guard";
import { TEAM_ACCOUNT_ROLES, parseAccess, serializeAccess } from "@/lib/auth/access";
import { TEAM_INVITE_TTL_MINUTES, issuePasswordReset, passwordResetPath } from "@/lib/auth/password-reset";
import { actionErrorMessage, errorMessageOf } from "@/lib/action-error";
import { sendNotification } from "@/lib/notifications";
import { slotDateKey, studioNow } from "@/lib/slot-time";
import {
  CreateTeamRoleSchema,
  DeleteTeamRoleSchema,
  InviteTeamMemberSchema,
  TeamMemberRefSchema,
  UpdateTeamMemberSchema,
  UpdateTeamRoleSchema,
  type CreateTeamRoleInput,
  type DeleteTeamRoleInput,
  type InviteTeamMemberInput,
  type TeamMemberRefInput,
  type UpdateTeamMemberInput,
  type UpdateTeamRoleInput,
} from "@/lib/validations/admin-team";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

class RoleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function fail(error: unknown, fallback: string, code = "TEAM_ROLE_FAILED") {
  if (error instanceof RoleError) return { success: false as const, error: error.code, message: error.message };
  return { success: false as const, error: code, message: actionErrorMessage(error, fallback) };
}

/** Names are unique per studio ignoring case ("editor" clashes with "Editor"); SQLite's own unique is case-sensitive. */
async function assertNameFree(tenantId: string, name: string, exceptId?: string) {
  const roles = await db.teamRole.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const lower = name.toLowerCase();
  if (roles.some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === lower)) {
    throw new RoleError("NAME_TAKEN", "A role with that name already exists.");
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** Owner only: a new role with its access. */
export async function createTeamRole(input: CreateTeamRoleInput) {
  try {
    const v = CreateTeamRoleSchema.parse(input);
    await requireOwner(v.tenantId);
    await assertNameFree(v.tenantId, v.name);
    const last = await db.teamRole.aggregate({ where: { tenantId: v.tenantId }, _max: { sortOrder: true } });
    try {
      const role = await db.teamRole.create({
        data: { tenantId: v.tenantId, name: v.name, access: serializeAccess(parseAccess(JSON.stringify(v.access))), sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
      safeRevalidate(`/${v.tenantSlug}/admin/settings`);
      return { success: true as const, roleId: role.id };
    } catch (e) {
      if (isUniqueViolation(e)) throw new RoleError("NAME_TAKEN", "A role with that name already exists.");
      throw e;
    }
  } catch (error) {
    return fail(error, "Failed to create the role.");
  }
}

/** Owner only: renames a role and replaces its access. Members' next request follows it; `affected` is how many have this role. */
export async function updateTeamRole(input: UpdateTeamRoleInput) {
  try {
    const v = UpdateTeamRoleSchema.parse(input);
    await requireOwner(v.tenantId);
    const role = await db.teamRole.findFirst({ where: { id: v.roleId, tenantId: v.tenantId }, select: { id: true } });
    if (!role) throw new RoleError("NOT_FOUND", "That role no longer exists.");
    await assertNameFree(v.tenantId, v.name, v.roleId);
    try {
      await db.teamRole.update({
        where: { id: v.roleId },
        data: { name: v.name, access: serializeAccess(parseAccess(JSON.stringify(v.access))) },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new RoleError("NAME_TAKEN", "A role with that name already exists.");
      throw e;
    }
    const affected = await db.user.count({ where: { tenantId: v.tenantId, teamRoleId: v.roleId } });
    safeRevalidate(`/${v.tenantSlug}/admin/settings`);
    return { success: true as const, affected };
  } catch (error) {
    return fail(error, "Failed to save the role.");
  }
}

/** Owner only: removes a role nobody holds. */
export async function deleteTeamRole(input: DeleteTeamRoleInput) {
  try {
    const v = DeleteTeamRoleSchema.parse(input);
    await requireOwner(v.tenantId);
    // Checked and deleted in one transaction so two deletes can't race a studio down to zero roles
    // (which would re-seed the starter roles on the next Team tab load).
    await db.$transaction(async (tx) => {
      const role = await tx.teamRole.findFirst({ where: { id: v.roleId, tenantId: v.tenantId }, select: { id: true } });
      if (!role) throw new RoleError("NOT_FOUND", "That role no longer exists.");
      const n = await tx.user.count({ where: { tenantId: v.tenantId, teamRoleId: v.roleId } });
      if (n > 0) throw new RoleError("ROLE_IN_USE", `Move its ${n} ${n === 1 ? "person" : "people"} to another role first.`);
      if ((await tx.teamRole.count({ where: { tenantId: v.tenantId } })) <= 1) {
        throw new RoleError("LAST_ROLE", "A studio needs at least one role. Create another role before deleting this one.");
      }
      await tx.teamRole.delete({ where: { id: v.roleId } });
    });
    safeRevalidate(`/${v.tenantSlug}/admin/settings`);
    return { success: true as const };
  } catch (error) {
    return fail(error, "Failed to delete the role.");
  }
}

// ---- Members ------------------------------------------------------------------------------

const INVITE_DAYS = TEAM_INVITE_TTL_MINUTES / (24 * 60);

type EmailDelivery = "SENT" | "SKIPPED" | "FAILED";

/** Stored extras: read back through parseAccess so only known areas, levels and ticks are kept. */
function storedExtras(extra: { areas: Record<string, string>; ticks: Record<string, boolean> } | null | undefined): string | null {
  return extra ? serializeAccess(parseAccess(JSON.stringify(extra))) : null;
}

async function studioRole(tenantId: string, roleId: string) {
  const role = await db.teamRole.findFirst({ where: { id: roleId, tenantId }, select: { id: true, name: true } });
  if (!role) throw new RoleError("ROLE_NOT_FOUND", "That role no longer exists. Pick another.");
  return role;
}

async function studioOf(tenantId: string) {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } });
  if (!tenant) throw new RoleError("NOT_FOUND", "Studio not found.");
  return tenant;
}

/**
 * The team account `userId` of this studio. The owner's own row can't be changed here; anything that
 * isn't a team account of this studio (a client, another studio's member) reads as not found.
 */
async function teamAccount(tenantId: string, userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, name: true, email: true, role: true, passwordHash: true, deactivatedAt: true, teamRole: { select: { name: true } } },
  });
  if (user?.role === "STUDIO_OWNER") throw new RoleError("CANNOT_CHANGE_OWNER", "The studio owner's own account can't be changed here.");
  if (!user || !TEAM_ACCOUNT_ROLES.includes(user.role)) throw new RoleError("NOT_FOUND", "That team member no longer exists.");
  return user;
}

/** Issues a fresh 30-day set-password link and emails it. A failed or skipped email never fails the action. */
async function sendInvite(
  tenant: { name: string; slug: string },
  member: { id: string; name: string; email: string },
  roleName: string,
  ownerName: string
): Promise<{ inviteUrl: string; emailDelivery: EmailDelivery; emailError?: string }> {
  const token = await issuePasswordReset(member.id, new Date(), TEAM_INVITE_TTL_MINUTES);
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  const inviteUrl = `${appUrl}${passwordResetPath(tenant.slug, member.email, token)}&welcome=1`;
  try {
    const res = await sendNotification(
      {
        event: "TEAM_INVITE",
        studioName: tenant.name,
        studioSlug: tenant.slug,
        clientName: member.name,
        clientEmail: member.email,
        ownerName,
        roleName,
        inviteUrl,
        expiresDays: INVITE_DAYS,
      },
      "EMAIL"
    );
    return { inviteUrl, emailDelivery: res.emailDelivery, emailError: res.emailError };
  } catch (err) {
    console.error("Team invite email failed:", err);
    return { inviteUrl, emailDelivery: "FAILED", emailError: errorMessageOf(err) };
  }
}

/** The session day of a booking: its slot's date, or its target date when it has no slot. */
function sessionDay(booking: { targetDate: string | null; slot: { date: Date } | null }): string | null {
  if (booking.slot) return slotDateKey(booking.slot.date);
  return booking.targetDate && /^\d{4}-\d{2}-\d{2}/.test(booking.targetDate) ? booking.targetDate.slice(0, 10) : null;
}

/**
 * Owner only: adds someone to the team by email. They get a link (emailed, and returned to show on
 * screen) to set their password; it lasts 30 days. One email can be on several studios' teams, but
 * not a client and a team member of the same studio.
 */
export async function inviteTeamMember(input: InviteTeamMemberInput) {
  try {
    const v = InviteTeamMemberSchema.parse(input);
    const owner = await requireOwner(v.tenantId);
    const tenant = await studioOf(v.tenantId);
    const role = await studioRole(v.tenantId, v.roleId);

    // Emails are stored lowercase; older rows may not be, so look for the address as typed too.
    const typed = typeof input.email === "string" ? input.email.trim() : v.email;
    const existing = await db.user.findFirst({
      where: { tenantId: v.tenantId, email: { in: Array.from(new Set([v.email, typed])) } },
      select: { name: true, role: true, deactivatedAt: true },
    });
    if (existing) {
      if (existing.role === "STUDIO_OWNER") throw new RoleError("EMAIL_IS_OWNER", "That's the studio owner's email. The owner is already on the team.");
      if (existing.role === "CLIENT") throw new RoleError("EMAIL_IS_CLIENT", `${v.email} is a client of this studio. A client can't also be on the team.`);
      if (existing.deactivatedAt) throw new RoleError("REMOVED_MEMBER", `${existing.name} was removed. Bring them back from the list instead.`);
      throw new RoleError("ALREADY_ON_TEAM", `${existing.name} is already on the team. Use Resend link if they need a new one.`);
    }

    let member: { id: string; name: string; email: string };
    try {
      member = await db.user.create({
        data: {
          tenantId: v.tenantId,
          name: v.name,
          email: v.email,
          role: "TEAM_MEMBER",
          teamRoleId: role.id,
          extraAccess: storedExtras(v.extraAccess),
        },
        select: { id: true, name: true, email: true },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new RoleError("ALREADY_ON_TEAM", "Someone with that email is already on the team.");
      throw e;
    }

    const sent = await sendInvite(tenant, member, role.name, owner.name);
    safeRevalidate(`/${tenant.slug}/admin/settings`);
    return { success: true as const, userId: member.id, ...sent };
  } catch (error) {
    return fail(error, "Failed to invite the team member.", "TEAM_MEMBER_FAILED");
  }
}

/** Owner only: a new set-password link for someone who hasn't set a password yet (the old link stops working). */
export async function resendTeamInvite(input: TeamMemberRefInput) {
  try {
    const v = TeamMemberRefSchema.parse(input);
    const owner = await requireOwner(v.tenantId);
    const member = await teamAccount(v.tenantId, v.userId);
    if (member.deactivatedAt) throw new RoleError("REMOVED_MEMBER", `${member.name} was removed. Bring them back from the list instead.`);
    if (member.passwordHash) {
      throw new RoleError("ALREADY_ACTIVE", `${member.name} has already set a password. They can use "Forgot password" if they need a new one.`);
    }
    const tenant = await studioOf(v.tenantId);
    const sent = await sendInvite(tenant, member, member.teamRole?.name ?? "a team member", owner.name);
    safeRevalidate(`/${tenant.slug}/admin/settings`);
    return { success: true as const, userId: member.id, ...sent };
  } catch (error) {
    return fail(error, "Failed to send a new link.", "TEAM_MEMBER_FAILED");
  }
}

/** Owner only: name, role and extras. Their next request follows the change. */
export async function updateTeamMember(input: UpdateTeamMemberInput) {
  try {
    const v = UpdateTeamMemberSchema.parse(input);
    await requireOwner(v.tenantId);
    const member = await teamAccount(v.tenantId, v.userId);
    const role = await studioRole(v.tenantId, v.roleId);
    await db.user.update({
      where: { id: member.id },
      data: { name: v.name, teamRoleId: role.id, extraAccess: storedExtras(v.extraAccess) },
    });
    safeRevalidate(`/${v.tenantSlug}/admin/settings`);
    return { success: true as const };
  } catch (error) {
    return fail(error, "Failed to save the team member.", "TEAM_MEMBER_FAILED");
  }
}

/**
 * Owner only: they can't sign in any more and every signed-in session ends now. Their name stays on
 * past and finished work; bookings still to happen (pending or confirmed, from today on) lose their
 * assignment, and any open set-password link stops working. Returns how many bookings were unassigned.
 */
export async function removeTeamMember(input: TeamMemberRefInput) {
  try {
    const v = TeamMemberRefSchema.parse(input);
    await requireOwner(v.tenantId);
    const member = await teamAccount(v.tenantId, v.userId);
    const now = new Date();
    const today = studioNow(now).dateKey;

    const unassigned = await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: member.id },
        data: {
          deactivatedAt: member.deactivatedAt ?? now,
          sessionsValidAfter: now,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });
      // Only open bookings: done, delivered and no-show keep their name whatever the date (a shoot
      // finished this morning is past work), and cancelled ones stay as they were.
      const assignments = await tx.bookingAssignment.findMany({
        where: { userId: member.id, booking: { status: { in: ["PENDING", "CONFIRMED"] } } },
        select: { id: true, booking: { select: { targetDate: true, slot: { select: { date: true } } } } },
      });
      const upcoming = assignments.filter(({ booking }) => {
        const day = sessionDay(booking);
        // No date yet: still to come.
        return !day || day >= today;
      });
      if (upcoming.length === 0) return 0;
      const { count } = await tx.bookingAssignment.deleteMany({ where: { id: { in: upcoming.map((a) => a.id) } } });
      return count;
    });

    safeRevalidate(`/${v.tenantSlug}/admin/settings`);
    safeRevalidate(`/${v.tenantSlug}/admin/bookings`);
    return { success: true as const, unassigned };
  } catch (error) {
    return fail(error, "Failed to remove the team member.", "TEAM_MEMBER_FAILED");
  }
}

/** Owner only: lets a removed member sign in again. Old sessions stay ended; past assignments aren't restored. */
export async function restoreTeamMember(input: TeamMemberRefInput) {
  try {
    const v = TeamMemberRefSchema.parse(input);
    await requireOwner(v.tenantId);
    const member = await teamAccount(v.tenantId, v.userId);
    await db.user.update({ where: { id: member.id }, data: { deactivatedAt: null } });
    safeRevalidate(`/${v.tenantSlug}/admin/settings`);
    return { success: true as const };
  } catch (error) {
    return fail(error, "Failed to bring the team member back.", "TEAM_MEMBER_FAILED");
  }
}

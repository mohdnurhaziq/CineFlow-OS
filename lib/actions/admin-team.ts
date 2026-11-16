"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/guard";
import { parseAccess, serializeAccess } from "@/lib/auth/access";
import { actionErrorMessage } from "@/lib/action-error";
import {
  CreateTeamRoleSchema,
  DeleteTeamRoleSchema,
  UpdateTeamRoleSchema,
  type CreateTeamRoleInput,
  type DeleteTeamRoleInput,
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

function fail(error: unknown, fallback: string) {
  if (error instanceof RoleError) return { success: false as const, error: error.code, message: error.message };
  return { success: false as const, error: "TEAM_ROLE_FAILED", message: actionErrorMessage(error, fallback) };
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
    const role = await db.teamRole.findFirst({ where: { id: v.roleId, tenantId: v.tenantId }, select: { id: true } });
    if (!role) throw new RoleError("NOT_FOUND", "That role no longer exists.");
    const n = await db.user.count({ where: { tenantId: v.tenantId, teamRoleId: v.roleId } });
    if (n > 0) throw new RoleError("ROLE_IN_USE", `Move its ${n} ${n === 1 ? "person" : "people"} to another role first.`);
    await db.teamRole.delete({ where: { id: v.roleId } });
    safeRevalidate(`/${v.tenantSlug}/admin/settings`);
    return { success: true as const };
  } catch (error) {
    return fail(error, "Failed to delete the role.");
  }
}
